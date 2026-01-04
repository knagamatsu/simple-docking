from datetime import datetime
from pathlib import Path
from typing import List
import logging

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import create_engine_from_settings, create_session_factory
from app.models import Base, Ligand, LigandConformer, Protein, Result, Run, Task
from app.schemas import (
    LigandCreate,
    LigandCreateResponse,
    LigandOut,
    ProteinOut,
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


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Simple Docking API")

    # CORS middleware with configurable origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
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
        if not payload.smiles and not payload.molfile:
            raise HTTPException(status_code=400, detail="smiles or molfile is required")

        # Basic validation
        if payload.smiles and len(payload.smiles) > 1000:
            raise HTTPException(status_code=400, detail="SMILES too long (max 1000 characters)")
        if payload.molfile and len(payload.molfile) > 100000:
            raise HTTPException(status_code=400, detail="Molfile too large (max 100KB)")

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
        return [
            ProteinOut(
                id=protein.id,
                name=protein.name,
                category=protein.category,
                organism=protein.organism,
                source_id=protein.source_id,
            )
            for protein in proteins
        ]

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

        preset_key = payload.preset.lower()
        preset = PRESETS.get(preset_key)
        if not preset:
            raise HTTPException(status_code=400, detail="Unknown preset")

        existing_conformers = session.execute(
            select(LigandConformer).where(LigandConformer.ligand_id == ligand.id)
        ).scalars().all()
        conformers = list(existing_conformers)

        required = preset["num_conformers"]
        if len(conformers) < required:
            start_idx = len(conformers)
            for idx in range(start_idx, required):
                conformer = LigandConformer(ligand_id=ligand.id, idx=idx)
                session.add(conformer)
                conformers.append(conformer)

        run = Run(
            ligand_id=ligand.id,
            preset=payload.preset,
            options_json=payload.options or {},
            status="PENDING",
        )
        session.add(run)
        session.flush()

        tasks = []
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
        session.commit()

        for task in tasks:
            enqueue_task(settings, task.id)

        return RunCreateResponse(run_id=run.id)

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
            protein = Protein(
                id=record["id"],
                name=record["name"],
                category=record.get("category"),
                organism=record.get("organism"),
                source_id=record.get("source_id"),
                receptor_pdbqt_path=record["receptor_pdbqt"],
                default_box_json=record.get("default_box"),
                pocket_method=record.get("pocket_method"),
                receptor_meta_json={"notes": record.get("notes")},
                status="READY",
            )
            session.add(protein)
        session.commit()
