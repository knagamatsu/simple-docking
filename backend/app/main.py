from datetime import datetime
from pathlib import Path
from typing import List
from uuid import uuid4
import csv
import io
import logging
import re
import zipfile
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import create_engine_from_settings, create_session_factory
from app.models import Base, Batch, Ligand, LigandConformer, Protein, Result, Run, Task
from app.schemas import (
    BatchCreate,
    BatchCreateResponse,
    BatchResultsResponse,
    BatchRunEntry,
    BatchStatusResponse,
    BatchSummary,
    LigandCreate,
    LigandCreateResponse,
    LigandOut,
    ProteinOut,
    ProteinImportRequest,
    ProteinPasteRequest,
    RunCreate,
    RunCreateResponse,
    RunResultsResponse,
    RunStatusResponse,
    TaskOut,
)
from app.settings import Settings
from app.tasks import enqueue_task, cancel_task
from app.util import load_protein_manifest, resolve_path

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

PRESETS = {
    "fast": {"num_conformers": 5, "exhaustiveness": 4, "num_poses": 5},
    "balanced": {"num_conformers": 15, "exhaustiveness": 8, "num_poses": 10},
    "thorough": {"num_conformers": 30, "exhaustiveness": 16, "num_poses": 20},
}
CUSTOM_CATEGORY = "Custom"
MAX_PDB_CHARS = 2_000_000
MAX_SMILES_CHARS = 1000
MAX_MOLFILE_CHARS = 100_000
PDB_ID_RE = re.compile(r"^[0-9A-Za-z]{4}$")
CSV_SMILES_HEADERS = {"smiles", "smile"}
CSV_NAME_HEADERS = {"name", "compound", "id", "identifier", "title"}


def safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def validate_ligand_input(smiles: str | None, molfile: str | None) -> None:
    if not smiles and not molfile:
        raise HTTPException(status_code=400, detail="smiles or molfile is required")
    if smiles and len(smiles) > MAX_SMILES_CHARS:
        raise HTTPException(status_code=400, detail="SMILES too long (max 1000 characters)")
    if molfile and len(molfile) > MAX_MOLFILE_CHARS:
        raise HTTPException(status_code=400, detail="Molfile too large (max 100KB)")


def parse_csv_ligands(csv_text: str) -> list[LigandCreate]:
    if csv_text is None:
        raise ValueError("CSV text is required")
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV must include a header row")

    field_map = {name.lower().strip(): name for name in reader.fieldnames if name}
    smiles_key = next((field_map[key] for key in CSV_SMILES_HEADERS if key in field_map), None)
    if not smiles_key:
        raise ValueError("CSV must include a smiles column")

    name_key = next((field_map[key] for key in CSV_NAME_HEADERS if key in field_map), None)
    ligands: list[LigandCreate] = []

    for idx, row in enumerate(reader, start=1):
        if row is None:
            continue
        smiles = (row.get(smiles_key) or "").strip()
        if not smiles:
            if any((value or "").strip() for value in row.values() if isinstance(value, str)):
                raise ValueError(f"Row {idx} is missing SMILES")
            continue
        name = (row.get(name_key) or "").strip() if name_key else ""
        ligands.append(LigandCreate(name=name or None, smiles=smiles))

    if not ligands:
        raise ValueError("No ligands found in CSV")
    return ligands


def extract_sdf_name(lines: list[str]) -> str | None:
    if not lines:
        return None
    title = lines[0].strip()
    property_names = {"name", "title", "compound", "id", "identifier"}
    for idx, line in enumerate(lines):
        match = re.match(r"^>\s*<([^>]+)>", line)
        if not match:
            continue
        prop = match.group(1).strip().lower()
        if prop not in property_names:
            continue
        value_lines: list[str] = []
        for value_line in lines[idx + 1 :]:
            if not value_line.strip():
                break
            value_lines.append(value_line.strip())
        if value_lines:
            return " ".join(value_lines)
    return title or None


def parse_sdf_ligands(sdf_text: str) -> list[LigandCreate]:
    if sdf_text is None:
        raise ValueError("SDF text is required")
    cleaned = sdf_text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = []
    for block in cleaned.split("$$$$"):
        trimmed = block.strip("\n")
        if not trimmed.strip():
            continue
        blocks.append(trimmed.rstrip() + "\n")

    if not blocks:
        raise ValueError("No ligands found in SDF")

    ligands: list[LigandCreate] = []
    for block in blocks:
        if len(block) > MAX_MOLFILE_CHARS:
            raise ValueError("Molfile too large (max 100KB)")
        lines = block.splitlines()
        name = extract_sdf_name(lines)
        ligands.append(LigandCreate(name=name or None, molfile=block))
    return ligands


def resolve_batch_ligands(payload: BatchCreate) -> list[LigandCreate]:
    if payload.ligands:
        return payload.ligands
    if payload.format and payload.text:
        fmt = payload.format.lower()
        if fmt == "csv":
            return parse_csv_ligands(payload.text)
        if fmt == "sdf":
            return parse_sdf_ligands(payload.text)
        raise ValueError("Unsupported batch format")
    raise ValueError("Batch input is required")


def resolve_run_options(preset: str, options: dict[str, object] | None) -> dict[str, object]:
    preset_key = preset.lower()
    preset_config = PRESETS.get(preset_key)
    if not preset_config:
        raise HTTPException(status_code=400, detail="Unknown preset")
    run_options = {**preset_config}
    if options:
        run_options.update(options)
    return run_options


def ensure_conformers(
    session: Session,
    ligand: Ligand,
    run_options: dict[str, object],
    default_conformers: int,
) -> list[LigandConformer]:
    existing_conformers = session.execute(
        select(LigandConformer).where(LigandConformer.ligand_id == ligand.id)
    ).scalars().all()
    conformers = list(existing_conformers)

    required = safe_int(run_options.get("num_conformers"), default_conformers)
    if len(conformers) < required:
        start_idx = len(conformers)
        for idx in range(start_idx, required):
            conformer = LigandConformer(ligand_id=ligand.id, idx=idx)
            session.add(conformer)
            conformers.append(conformer)
    return conformers


def create_run_tasks(
    session: Session,
    ligand: Ligand,
    proteins: list[Protein],
    preset: str,
    run_options: dict[str, object],
    batch_id: str | None = None,
) -> tuple[Run, list[Task]]:
    preset_config = PRESETS.get(preset.lower())
    if not preset_config:
        raise HTTPException(status_code=400, detail="Unknown preset")
    conformers = ensure_conformers(session, ligand, run_options, preset_config["num_conformers"])

    run = Run(
        ligand_id=ligand.id,
        batch_id=batch_id,
        preset=preset,
        options_json=run_options,
        status="PENDING",
    )
    session.add(run)
    session.flush()

    tasks: list[Task] = []
    for protein in proteins:
        for conformer in conformers:
            task = Task(
                run_id=run.id,
                protein_id=protein.id,
                conformer_id=conformer.id,
                status="PENDING",
                attempts=0,
            )
            session.add(task)
            tasks.append(task)

    run.total_tasks = len(tasks)
    return run, tasks


def summarize_runs(runs: list[Run]) -> dict[str, int | str]:
    total_runs = len(runs)
    done_runs = len([run for run in runs if run.status == "SUCCEEDED"])
    failed_runs = len([run for run in runs if run.status == "FAILED"])
    running_runs = len([run for run in runs if run.status == "RUNNING"])
    total_tasks = sum(run.total_tasks for run in runs)
    done_tasks = sum(run.done_tasks for run in runs)
    failed_tasks = sum(run.failed_tasks for run in runs)

    if total_runs == 0:
        status = "PENDING"
    elif done_runs == total_runs:
        status = "SUCCEEDED"
    elif failed_runs > 0 and done_runs + failed_runs == total_runs:
        status = "FAILED"
    elif running_runs > 0:
        status = "RUNNING"
    else:
        status = "PENDING"

    return {
        "status": status,
        "total_runs": total_runs,
        "done_runs": done_runs,
        "failed_runs": failed_runs,
        "total_tasks": total_tasks,
        "done_tasks": done_tasks,
        "failed_tasks": failed_tasks,
    }


def normalize_pdb_text(pdb_text: str) -> str:
    if pdb_text is None:
        raise ValueError("PDB content is required")
    cleaned = pdb_text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        raise ValueError("PDB content is empty")
    if len(cleaned) > MAX_PDB_CHARS:
        raise ValueError("PDB content is too large")
    lines = cleaned.split("\n")
    if not any(line[0:6].strip() == "ATOM" for line in lines):
        raise ValueError("PDB must include ATOM records")
    return "\n".join(lines) + "\n"


def pdb_text_to_pdbqt(pdb_text: str) -> str:
    lines = []
    for line in pdb_text.splitlines():
        record = line[0:6].strip()
        if record == "ATOM":
            lines.append(line)
        elif record == "END":
            lines.append("END")
            break
    if not lines:
        raise ValueError("No ATOM records found for PDBQT conversion")
    if lines[-1] != "END":
        lines.append("END")
    return "\n".join(lines) + "\n"


def ensure_custom_protein_dir(settings: Settings, protein_id: str) -> Path:
    base_dir = Path(settings.protein_library_path) / "custom" / protein_id
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def write_custom_protein_files(settings: Settings, protein_id: str, pdb_text: str) -> dict:
    base_dir = ensure_custom_protein_dir(settings, protein_id)
    pdb_path = base_dir / "receptor.pdb"
    pdbqt_path = base_dir / "receptor.pdbqt"

    pdb_path.write_text(pdb_text, encoding="utf-8")
    pdbqt_text = pdb_text_to_pdbqt(pdb_text)
    pdbqt_path.write_text(pdbqt_text, encoding="utf-8")

    rel_base = Path("custom") / protein_id
    return {
        "receptor_pdb": str(rel_base / "receptor.pdb"),
        "receptor_pdbqt": str(rel_base / "receptor.pdbqt"),
    }


def fetch_pdb_from_rcsb(pdb_id: str) -> str:
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    try:
        with urllib_request.urlopen(url, timeout=10) as response:
            data = response.read()
    except HTTPError as exc:
        if exc.code == 404:
            raise ValueError("PDB ID not found") from exc
        raise RuntimeError("Failed to fetch PDB from RCSB") from exc
    except URLError as exc:
        raise RuntimeError("Failed to reach RCSB") from exc

    try:
        return data.decode("utf-8", errors="ignore")
    except UnicodeDecodeError as exc:
        raise RuntimeError("Failed to decode PDB response") from exc


def protein_to_out(protein: Protein) -> ProteinOut:
    return ProteinOut(
        id=protein.id,
        name=protein.name,
        category=protein.category,
        organism=protein.organism,
        source_id=protein.source_id,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Simple Docking API")

    # CORS middleware with configurable origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    # Rate limiting
    limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)

    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    @app.on_event("startup")
    def on_startup():
        Base.metadata.create_all(engine)
        if settings.seed_proteins_on_startup:
            seed_proteins(engine, settings)

    def get_session():
        with session_factory() as session:
            yield session

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/ligands", response_model=LigandCreateResponse)
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def create_ligand(request: Request, payload: LigandCreate, session: Session = Depends(get_session)):
        validate_ligand_input(payload.smiles, payload.molfile)

        try:
            ligand = Ligand(
                name=payload.name,
                smiles=payload.smiles,
                molfile=payload.molfile,
                input_type="SMILES" if payload.smiles else "MOLFILE",
                status="READY",
            )
            session.add(ligand)
            session.commit()
            logger.info(f"Created ligand {ligand.id}")
            return LigandCreateResponse(ligand_id=ligand.id, status=ligand.status)
        except Exception as e:
            logger.error(f"Failed to create ligand: {e}")
            session.rollback()
            raise HTTPException(status_code=500, detail="Failed to create ligand")

    @app.get("/ligands/{ligand_id}", response_model=LigandOut)
    def get_ligand(ligand_id: str, session: Session = Depends(get_session)):
        ligand = session.get(Ligand, ligand_id)
        if not ligand:
            raise HTTPException(status_code=404, detail="Ligand not found")
        return LigandOut(
            id=ligand.id,
            created_at=ligand.created_at,
            name=ligand.name,
            smiles=ligand.smiles,
            molfile=ligand.molfile,
            status=ligand.status,
            error=ligand.error,
        )

    @app.get("/proteins", response_model=List[ProteinOut])
    def list_proteins(
        category: str | None = Query(default=None),
        q: str | None = Query(default=None),
        session: Session = Depends(get_session),
    ):
        query = select(Protein)
        if category:
            query = query.where(Protein.category == category)
        if q:
            query = query.where(Protein.name.ilike(f"%{q}%"))
        proteins = session.execute(query).scalars().all()
        return [protein_to_out(protein) for protein in proteins]

    @app.post("/proteins/import", response_model=ProteinOut)
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def import_protein_from_pdb(
        request: Request,
        payload: ProteinImportRequest,
        session: Session = Depends(get_session),
    ):
        pdb_id = (payload.pdb_id or "").strip().upper()
        if not PDB_ID_RE.fullmatch(pdb_id):
            raise HTTPException(status_code=400, detail="Invalid PDB ID")

        source_id = f"PDB:{pdb_id}"
        existing = session.execute(select(Protein).where(Protein.source_id == source_id)).scalar_one_or_none()
        if existing:
            return protein_to_out(existing)

        try:
            pdb_text_raw = fetch_pdb_from_rcsb(pdb_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        try:
            pdb_text = normalize_pdb_text(pdb_text_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        protein_id = f"pdb_{pdb_id.lower()}"
        if session.get(Protein, protein_id):
            protein_id = f"{protein_id}_{uuid4().hex[:6]}"

        paths = write_custom_protein_files(settings, protein_id, pdb_text)
        category = payload.category or CUSTOM_CATEGORY
        name = payload.name or f"PDB {pdb_id}"
        meta = {
            "receptor_pdb": paths["receptor_pdb"],
            "source": "rcsb",
            "pdb_id": pdb_id,
        }

        protein = Protein(
            id=protein_id,
            name=name,
            category=category,
            organism=payload.organism,
            source_id=source_id,
            receptor_pdbqt_path=paths["receptor_pdbqt"],
            receptor_meta_json=meta,
            pocket_method="auto",
            status="READY",
        )
        session.add(protein)
        session.commit()
        return protein_to_out(protein)

    @app.post("/proteins/paste", response_model=ProteinOut)
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def paste_protein(
        request: Request,
        payload: ProteinPasteRequest,
        session: Session = Depends(get_session),
    ):
        try:
            pdb_text = normalize_pdb_text(payload.pdb_text)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        category = payload.category or CUSTOM_CATEGORY
        protein_id = f"custom_{uuid4().hex[:8]}"
        while session.get(Protein, protein_id):
            protein_id = f"custom_{uuid4().hex[:8]}"

        paths = write_custom_protein_files(settings, protein_id, pdb_text)
        name = payload.name or f"Custom protein {protein_id[-4:]}"
        meta = {
            "receptor_pdb": paths["receptor_pdb"],
            "source": "paste",
        }

        protein = Protein(
            id=protein_id,
            name=name,
            category=category,
            organism=payload.organism,
            source_id="User upload",
            receptor_pdbqt_path=paths["receptor_pdbqt"],
            receptor_meta_json=meta,
            pocket_method="auto",
            status="READY",
        )
        session.add(protein)
        session.commit()
        return protein_to_out(protein)

    @app.get("/runs")
    def list_runs(
        status: str | None = Query(default=None),
        session: Session = Depends(get_session),
    ):
        query = select(Run).order_by(Run.created_at.desc())
        if status:
            query = query.where(Run.status == status)
        runs = session.execute(query).scalars().all()
        return [
            {
                "id": run.id,
                "created_at": run.created_at,
                "ligand_id": run.ligand_id,
                "batch_id": run.batch_id,
                "preset": run.preset,
                "status": run.status,
                "total_tasks": run.total_tasks,
                "done_tasks": run.done_tasks,
                "failed_tasks": run.failed_tasks,
            }
            for run in runs
        ]

    @app.post("/runs", response_model=RunCreateResponse)
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def create_run(request: Request, payload: RunCreate, session: Session = Depends(get_session)):
        ligand = session.get(Ligand, payload.ligand_id)
        if not ligand:
            raise HTTPException(status_code=404, detail="Ligand not found")
        if not payload.protein_ids:
            raise HTTPException(status_code=400, detail="protein_ids is required")

        proteins = session.execute(
            select(Protein).where(Protein.id.in_(payload.protein_ids))
        ).scalars().all()
        if len(proteins) != len(payload.protein_ids):
            raise HTTPException(status_code=404, detail="Protein not found")

        run_options = resolve_run_options(payload.preset, payload.options)

        run, tasks = create_run_tasks(
            session=session,
            ligand=ligand,
            proteins=proteins,
            preset=payload.preset,
            run_options=run_options,
        )
        session.commit()

        for task in tasks:
            enqueue_task(settings, task.id)

        return RunCreateResponse(run_id=run.id)

    @app.get("/batches", response_model=List[BatchSummary])
    def list_batches(
        status: str | None = Query(default=None),
        session: Session = Depends(get_session),
    ):
        batches = session.execute(select(Batch).order_by(Batch.created_at.desc())).scalars().all()
        runs = session.execute(select(Run).where(Run.batch_id.isnot(None))).scalars().all()
        runs_by_batch: dict[str, list[Run]] = {}
        for run in runs:
            if not run.batch_id:
                continue
            runs_by_batch.setdefault(run.batch_id, []).append(run)

        summaries: list[BatchSummary] = []
        for batch in batches:
            stats = summarize_runs(runs_by_batch.get(batch.id, []))
            if status and stats["status"] != status:
                continue
            summaries.append(
                BatchSummary(
                    id=batch.id,
                    created_at=batch.created_at,
                    name=batch.name,
                    preset=batch.preset,
                    status=stats["status"],
                    total_runs=stats["total_runs"],
                    done_runs=stats["done_runs"],
                    failed_runs=stats["failed_runs"],
                    total_tasks=stats["total_tasks"],
                    done_tasks=stats["done_tasks"],
                    failed_tasks=stats["failed_tasks"],
                )
            )
        return summaries

    @app.post("/batches", response_model=BatchCreateResponse)
    @limiter.limit(f"{settings.rate_limit_per_minute}/minute")
    def create_batch(request: Request, payload: BatchCreate, session: Session = Depends(get_session)):
        if not payload.protein_ids:
            raise HTTPException(status_code=400, detail="protein_ids is required")

        proteins = session.execute(
            select(Protein).where(Protein.id.in_(payload.protein_ids))
        ).scalars().all()
        if len(proteins) != len(payload.protein_ids):
            raise HTTPException(status_code=404, detail="Protein not found")

        try:
            ligand_inputs = resolve_batch_ligands(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        run_options = resolve_run_options(payload.preset, payload.options)
        batch = Batch(name=payload.name, preset=payload.preset, options_json=run_options)
        session.add(batch)
        session.flush()

        tasks: list[Task] = []
        run_count = 0
        for ligand_input in ligand_inputs:
            validate_ligand_input(ligand_input.smiles, ligand_input.molfile)
            ligand = Ligand(
                name=ligand_input.name,
                smiles=ligand_input.smiles,
                molfile=ligand_input.molfile,
                input_type="SMILES" if ligand_input.smiles else "MOLFILE",
                status="READY",
            )
            session.add(ligand)
            session.flush()

            _, run_tasks = create_run_tasks(
                session=session,
                ligand=ligand,
                proteins=proteins,
                preset=payload.preset,
                run_options=run_options,
                batch_id=batch.id,
            )
            tasks.extend(run_tasks)
            run_count += 1

        session.commit()

        for task in tasks:
            enqueue_task(settings, task.id)

        return BatchCreateResponse(
            batch_id=batch.id,
            run_count=run_count,
            ligand_count=len(ligand_inputs),
        )

    @app.get("/batches/{batch_id}/status", response_model=BatchStatusResponse)
    def get_batch_status(batch_id: str, session: Session = Depends(get_session)):
        batch = session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        runs = session.execute(select(Run).where(Run.batch_id == batch.id)).scalars().all()
        stats = summarize_runs(runs)
        return BatchStatusResponse(**stats)

    @app.get("/batches/{batch_id}/results", response_model=BatchResultsResponse)
    def get_batch_results(batch_id: str, session: Session = Depends(get_session)):
        batch = session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        runs = session.execute(select(Run).where(Run.batch_id == batch.id)).scalars().all()
        run_ids = [run.id for run in runs]
        tasks = session.execute(select(Task).where(Task.run_id.in_(run_ids))).scalars().all()
        task_ids = [task.id for task in tasks]
        results = session.execute(select(Result).where(Result.task_id.in_(task_ids))).scalars().all()

        result_by_task = {result.task_id: result for result in results}
        tasks_by_run: dict[str, list[Task]] = {}
        for task in tasks:
            tasks_by_run.setdefault(task.run_id, []).append(task)

        proteins = {
            protein.id: protein
            for protein in session.execute(select(Protein)).scalars().all()
        }
        ligands = {
            ligand.id: ligand
            for ligand in session.execute(select(Ligand)).scalars().all()
        }

        run_entries: list[BatchRunEntry] = []
        for run in runs:
            best_score = None
            best_protein = None
            for task in tasks_by_run.get(run.id, []):
                result = result_by_task.get(task.id)
                if result and result.best_score is not None:
                    if best_score is None or result.best_score < best_score:
                        best_score = result.best_score
                        protein = proteins.get(task.protein_id)
                        best_protein = protein.name if protein else task.protein_id

            ligand = ligands.get(run.ligand_id)
            run_entries.append(
                BatchRunEntry(
                    run_id=run.id,
                    ligand_id=run.ligand_id,
                    ligand_name=ligand.name if ligand else None,
                    best_score=best_score,
                    best_protein=best_protein,
                    status=run.status,
                    total_tasks=run.total_tasks,
                    done_tasks=run.done_tasks,
                    failed_tasks=run.failed_tasks,
                )
            )

        run_entries.sort(key=lambda item: (item.best_score is None, item.best_score or 0))
        stats = summarize_runs(runs)

        return BatchResultsResponse(
            batch_id=batch.id,
            name=batch.name,
            preset=batch.preset,
            status=BatchStatusResponse(**stats),
            runs=run_entries,
        )

    @app.get("/batches/{batch_id}/export")
    def export_batch(batch_id: str, fmt: str = Query(default="zip"), session: Session = Depends(get_session)):
        batch = session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        runs = session.execute(select(Run).where(Run.batch_id == batch.id)).scalars().all()
        run_ids = [run.id for run in runs]
        tasks = session.execute(select(Task).where(Task.run_id.in_(run_ids))).scalars().all()
        results = session.execute(select(Result).where(Result.task_id.in_([t.id for t in tasks]))).scalars().all()
        result_by_task = {result.task_id: result for result in results}

        proteins = {
            protein.id: protein
            for protein in session.execute(select(Protein)).scalars().all()
        }
        ligands = {
            ligand.id: ligand
            for ligand in session.execute(select(Ligand)).scalars().all()
        }

        if fmt == "csv":
            lines = ["run_id,ligand_id,ligand_name,status,best_score,best_protein"]
            tasks_by_run: dict[str, list[Task]] = {}
            for task in tasks:
                tasks_by_run.setdefault(task.run_id, []).append(task)

            for run in runs:
                best_score = None
                best_protein = None
                for task in tasks_by_run.get(run.id, []):
                    result = result_by_task.get(task.id)
                    if result and result.best_score is not None:
                        if best_score is None or result.best_score < best_score:
                            best_score = result.best_score
                            protein = proteins.get(task.protein_id)
                            best_protein = protein.name if protein else task.protein_id
                ligand = ligands.get(run.ligand_id)
                lines.append(
                    f"{run.id},{run.ligand_id},{ligand.name if ligand else ''},{run.status},{best_score},{best_protein or ''}"
                )
            return PlainTextResponse("\n".join(lines), media_type="text/csv")

        if fmt == "zip":
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                summary_lines = ["run_id,ligand_id,ligand_name,status,best_score,best_protein"]

                tasks_by_run: dict[str, list[Task]] = {}
                for task in tasks:
                    tasks_by_run.setdefault(task.run_id, []).append(task)

                for run in runs:
                    ligand = ligands.get(run.ligand_id)
                    ligand_name = ligand.name if ligand and ligand.name else run.ligand_id[:8]
                    ligand_dir = ligand_name.replace(" ", "_")

                    best_score = None
                    best_protein = None
                    for task in tasks_by_run.get(run.id, []):
                        result = result_by_task.get(task.id)
                        if result and result.best_score is not None:
                            if best_score is None or result.best_score < best_score:
                                best_score = result.best_score
                                protein = proteins.get(task.protein_id)
                                best_protein = protein.name if protein else task.protein_id

                        pose_paths = result.pose_paths_json or [] if result else []
                        protein = proteins.get(task.protein_id)
                        protein_name_safe = (protein.name if protein else task.protein_id).replace(" ", "_")
                        for idx, pose_path in enumerate(pose_paths, 1):
                            abs_pose_path = Path(settings.object_store_path) / pose_path
                            if abs_pose_path.exists():
                                zip_file.write(
                                    abs_pose_path,
                                    arcname=f"{ligand_dir}/{protein_name_safe}/pose_{idx}.pdbqt",
                                )

                    summary_lines.append(
                        f"{run.id},{run.ligand_id},{ligand.name if ligand else ''},{run.status},{best_score},{best_protein or ''}"
                    )

                    csv_buffer = io.StringIO()
                    csv_writer = csv.DictWriter(
                        csv_buffer, fieldnames=["protein_id", "protein_name", "best_score", "status", "pose_count"]
                    )
                    csv_writer.writeheader()

                    for task in tasks_by_run.get(run.id, []):
                        protein = proteins.get(task.protein_id)
                        result = result_by_task.get(task.id)
                        pose_paths = result.pose_paths_json or [] if result else []
                        csv_writer.writerow({
                            "protein_id": task.protein_id,
                            "protein_name": protein.name if protein else task.protein_id,
                            "best_score": result.best_score if result else None,
                            "status": task.status,
                            "pose_count": len(pose_paths),
                        })

                    zip_file.writestr(f"{ligand_dir}/summary.csv", csv_buffer.getvalue())

                zip_file.writestr("batch_summary.csv", "\n".join(summary_lines))

            zip_buffer.seek(0)
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename=batch_{batch_id}_results.zip"},
            )

        raise HTTPException(status_code=400, detail="Unsupported format")

    @app.get("/runs/{run_id}/status", response_model=RunStatusResponse)
    def get_run_status(run_id: str, session: Session = Depends(get_session)):
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        tasks = session.execute(select(Task).where(Task.run_id == run.id)).scalars().all()
        total = len(tasks)
        done = len([t for t in tasks if t.status == "SUCCEEDED"])
        failed = len([t for t in tasks if t.status == "FAILED"])
        running = [t.id for t in tasks if t.status == "RUNNING"]

        if total == 0:
            status = "PENDING"
        elif done == total:
            status = "SUCCEEDED"
        elif failed > 0 and done + failed == total:
            status = "FAILED"
        elif running:
            status = "RUNNING"
        else:
            status = "PENDING"

        run.status = status
        run.total_tasks = total
        run.done_tasks = done
        run.failed_tasks = failed
        session.commit()

        return RunStatusResponse(
            status=status,
            total=total,
            done=done,
            failed=failed,
            running=running,
        )

    @app.get("/runs/{run_id}/results", response_model=RunResultsResponse)
    def get_run_results(run_id: str, session: Session = Depends(get_session)):
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        tasks = session.execute(select(Task).where(Task.run_id == run.id)).scalars().all()
        task_ids = [task.id for task in tasks]

        results = session.execute(select(Result).where(Result.task_id.in_(task_ids))).scalars().all()
        result_by_task = {result.task_id: result for result in results}

        proteins = {
            protein.id: protein
            for protein in session.execute(select(Protein)).scalars().all()
        }

        per_protein = {}
        for task in tasks:
            protein = proteins.get(task.protein_id)
            result = result_by_task.get(task.id)
            best_score = result.best_score if result else None
            pose_paths = result.pose_paths_json or [] if result else []
            metrics = result.metrics_json if result else None

            entry = per_protein.setdefault(
                task.protein_id,
                {
                    "protein_id": task.protein_id,
                    "protein_name": protein.name if protein else task.protein_id,
                    "best_score": None,
                    "percentile": None,
                    "pose_paths": [],
                    "status_list": [],
                    "error_list": [],
                    "receptor_pdbqt_path": protein.receptor_pdbqt_path if protein else None,
                    "metrics": None,
                },
            )
            entry["status_list"].append(task.status)
            if task.error:
                entry["error_list"].append(task.error)

            if best_score is not None and (
                entry["best_score"] is None or best_score < entry["best_score"]
            ):
                entry["best_score"] = best_score
                entry["pose_paths"] = pose_paths
                entry["metrics"] = metrics

        per_protein_list = []
        for entry in per_protein.values():
            statuses = entry.pop("status_list")
            errors = entry.pop("error_list")
            if "RUNNING" in statuses:
                entry["status"] = "RUNNING"
            elif "PENDING" in statuses:
                entry["status"] = "PENDING"
            elif "SUCCEEDED" in statuses:
                entry["status"] = "SUCCEEDED"
            else:
                entry["status"] = "FAILED"
            entry["error"] = errors[0] if errors else None
            per_protein_list.append(entry)
        ranking = sorted(
            per_protein_list,
            key=lambda item: (item["best_score"] is None, item["best_score"] or 0),
        )

        return RunResultsResponse(ranking=ranking, per_protein=per_protein_list)

    @app.get("/tasks/{task_id}", response_model=TaskOut)
    def get_task(task_id: str, session: Session = Depends(get_session)):
        task = session.get(Task, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return TaskOut(id=task.id, status=task.status, error=task.error, log_path=task.log_path)

    @app.post("/tasks/{task_id}/cancel")
    def cancel_task_endpoint(task_id: str, session: Session = Depends(get_session)):
        task = session.get(Task, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.status not in ["PENDING", "RUNNING"]:
            raise HTTPException(status_code=400, detail=f"Cannot cancel task with status {task.status}")

        try:
            cancel_task(settings, task_id)
            task.status = "CANCELLED"
            task.error = "Cancelled by user"
            session.commit()
            logger.info(f"Cancelled task {task_id}")
            return {"status": "cancelled", "task_id": task_id}
        except Exception as e:
            logger.error(f"Failed to cancel task {task_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to cancel task")

    @app.post("/runs/{run_id}/cancel")
    def cancel_run(run_id: str, session: Session = Depends(get_session)):
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        tasks = session.execute(select(Task).where(Task.run_id == run_id)).scalars().all()
        cancelled_count = 0

        for task in tasks:
            if task.status in ["PENDING", "RUNNING"]:
                try:
                    cancel_task(settings, task.id)
                    task.status = "CANCELLED"
                    task.error = "Cancelled by user"
                    cancelled_count += 1
                except Exception as e:
                    logger.error(f"Failed to cancel task {task.id}: {e}")

        session.commit()
        logger.info(f"Cancelled {cancelled_count} tasks for run {run_id}")
        return {"status": "cancelled", "run_id": run_id, "cancelled_tasks": cancelled_count}

    @app.get("/runs/{run_id}/export")
    def export_run(run_id: str, fmt: str = Query(default="csv"), session: Session = Depends(get_session)):
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        tasks = session.execute(select(Task).where(Task.run_id == run.id)).scalars().all()
        results = session.execute(select(Result).where(Result.task_id.in_([t.id for t in tasks]))).scalars().all()
        result_by_task = {result.task_id: result for result in results}

        proteins = {
            protein.id: protein
            for protein in session.execute(select(Protein)).scalars().all()
        }

        rows = []
        for task in tasks:
            protein = proteins.get(task.protein_id)
            result = result_by_task.get(task.id)
            rows.append(
                {
                    "protein_id": task.protein_id,
                    "protein_name": protein.name if protein else task.protein_id,
                    "best_score": result.best_score if result else None,
                    "status": task.status,
                }
            )

        if fmt == "csv":
            lines = ["protein_id,protein_name,best_score,status"]
            for row in rows:
                lines.append(
                    f"{row['protein_id']},{row['protein_name']},{row['best_score']},{row['status']}"
                )
            return PlainTextResponse("\n".join(lines), media_type="text/csv")

        if fmt == "sdf":
            ligand = session.get(Ligand, run.ligand_id)
            mol_block = ligand.molfile or f"{ligand.smiles or ''}\n"
            blocks = []
            for row in rows:
                blocks.append(
                    f"{mol_block}\n> <Protein>\n{row['protein_name']}\n> <Score>\n{row['best_score']}\n$$$$"
                )
            return PlainTextResponse("\n".join(blocks), media_type="chemical/x-mdl-sdfile")

        if fmt == "zip":
            # Create ZIP file in memory
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                # Add summary CSV
                csv_buffer = io.StringIO()
                csv_writer = csv.DictWriter(
                    csv_buffer, fieldnames=["protein_id", "protein_name", "best_score", "status", "pose_count"]
                )
                csv_writer.writeheader()

                for task in tasks:
                    protein = proteins.get(task.protein_id)
                    result = result_by_task.get(task.id)
                    pose_paths = result.pose_paths_json or [] if result else []

                    csv_writer.writerow({
                        "protein_id": task.protein_id,
                        "protein_name": protein.name if protein else task.protein_id,
                        "best_score": result.best_score if result else None,
                        "status": task.status,
                        "pose_count": len(pose_paths),
                    })

                    # Add pose files to ZIP
                    for idx, pose_path in enumerate(pose_paths, 1):
                        abs_pose_path = Path(settings.object_store_path) / pose_path
                        if abs_pose_path.exists():
                            protein_name_safe = (protein.name if protein else task.protein_id).replace(" ", "_")
                            zip_file.write(
                                abs_pose_path,
                                arcname=f"{protein_name_safe}/pose_{idx}.pdbqt"
                            )

                zip_file.writestr("summary.csv", csv_buffer.getvalue())

            zip_buffer.seek(0)
            return StreamingResponse(
                zip_buffer,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename=run_{run_id}_results.zip"}
            )

        raise HTTPException(status_code=400, detail="Unsupported format")

    @app.get("/files/{file_path:path}")
    def get_object_file(file_path: str):
        base = Path(settings.object_store_path).resolve()
        try:
            target = resolve_path(base, file_path)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid path")
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(target)

    @app.get("/protein-files/{file_path:path}")
    def get_protein_file(file_path: str):
        base = Path(settings.protein_library_path).resolve()
        try:
            target = resolve_path(base, file_path)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid path")
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(target)

    return app


app = create_app()


def seed_proteins(engine, settings: Settings):
    manifest_path = Path(settings.protein_library_path) / "manifest.json"
    if not manifest_path.exists():
        return

    with create_session_factory(engine)() as session:
        existing = session.execute(select(func.count()).select_from(Protein)).scalar_one()
        if existing:
            return

        records = load_protein_manifest(manifest_path)
        for record in records:
            meta = {"notes": record.get("notes")}
            if record.get("receptor_pdb"):
                meta["receptor_pdb"] = record.get("receptor_pdb")
            if record.get("pocket_pdb"):
                meta["pocket_pdb"] = record.get("pocket_pdb")

            protein = Protein(
                id=record["id"],
                name=record["name"],
                category=record.get("category"),
                organism=record.get("organism"),
                source_id=record.get("source_id"),
                receptor_pdbqt_path=record["receptor_pdbqt"],
                default_box_json=record.get("default_box"),
                pocket_method=record.get("pocket_method"),
                receptor_meta_json=meta,
                status="READY",
            )
            session.add(protein)
        session.commit()
