import hashlib
from datetime import datetime
from pathlib import Path
from typing import Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ligand, LigandConformer, Protein, Result, Run, Task
from app.settings import Settings


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_log(log_path: Path, lines: list[str]) -> None:
    ensure_dir(log_path.parent)
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def fallback_pdb(ligand_name: str) -> str:
    return (
        "HEADER    LIGAND\n"
        f"REMARK    {ligand_name}\n"
        "ATOM      1  C   LIG A   1       0.000   0.000   0.000  1.00  0.00           C\n"
        "ATOM      2  O   LIG A   1       1.200   0.000   0.000  1.00  0.00           O\n"
        "TER\n"
        "END\n"
    )


def generate_pdb_block(ligand: Ligand) -> str:
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
    except Exception:
        return fallback_pdb(ligand.name or ligand.id)

    mol = None
    if ligand.smiles:
        mol = Chem.MolFromSmiles(ligand.smiles)
    if mol is None and ligand.molfile:
        mol = Chem.MolFromMolBlock(ligand.molfile, sanitize=True)
    if mol is None:
        raise ValueError("Invalid ligand input")

    mol = Chem.AddHs(mol)
    status = AllChem.EmbedMolecule(mol, AllChem.ETKDG())
    if status != 0:
        raise ValueError("Failed to embed ligand")
    AllChem.UFFOptimizeMolecule(mol)
    return Chem.MolToPDBBlock(mol)


def compute_mock_score(task: Task, ligand: Ligand, protein: Protein) -> float:
    seed = f"{task.id}:{ligand.id}:{protein.id}".encode("utf-8")
    digest = hashlib.sha256(seed).hexdigest()
    value = int(digest[:6], 16)
    return -1.0 * (value % 1000) / 100.0


def prepare_conformer(
    settings: Settings,
    session: Session,
    ligand: Ligand,
    conformer: LigandConformer,
    log_lines: list[str],
) -> Tuple[Path, Path]:
    ligand_dir = Path(settings.object_store_path) / "ligands" / ligand.id
    ensure_dir(ligand_dir)

    pdb_path = ligand_dir / f"conf_{conformer.idx}.pdb"
    pdbqt_path = ligand_dir / f"conf_{conformer.idx}.pdbqt"

    if not pdb_path.exists():
        pdb_block = generate_pdb_block(ligand)
        pdb_path.write_text(pdb_block, encoding="utf-8")
        pdbqt_path.write_text(pdb_block, encoding="utf-8")
        log_lines.append(f"Generated conformer {conformer.idx}")

    conformer.pdb_path = str(pdb_path.relative_to(Path(settings.object_store_path)))
    conformer.pdbqt_path = str(pdbqt_path.relative_to(Path(settings.object_store_path)))
    conformer.status = "READY"
    session.add(conformer)

    return pdb_path, pdbqt_path


def execute_task(settings: Settings, session: Session, task: Task) -> None:
    log_lines: list[str] = []
    task.started_at = datetime.utcnow()
    task.status = "RUNNING"
    task.attempts += 1
    session.commit()

    try:
        run = session.get(Run, task.run_id)
        ligand = session.get(Ligand, run.ligand_id)
        protein = session.get(Protein, task.protein_id)
        conformer = session.get(LigandConformer, task.conformer_id) if task.conformer_id else None

        if not ligand or not protein:
            raise RuntimeError("Missing ligand or protein")

        if not ligand.smiles and not ligand.molfile:
            ligand.status = "FAILED"
            ligand.error = "Missing ligand input"
            session.add(ligand)
            raise RuntimeError("Missing ligand input")

        if conformer:
            prepare_conformer(settings, session, ligand, conformer, log_lines)

        receptor_path = Path(settings.protein_library_path) / protein.receptor_pdbqt_path
        if not receptor_path.exists():
            raise RuntimeError("Receptor file not found")

        score = compute_mock_score(task, ligand, protein)
        pose_dir = Path(settings.object_store_path) / "poses" / task.id
        ensure_dir(pose_dir)
        pose_path = pose_dir / "pose_0.pdb"

        if conformer and conformer.pdb_path:
            source = Path(settings.object_store_path) / conformer.pdb_path
            pose_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            pose_path.write_text(fallback_pdb(ligand.name or ligand.id), encoding="utf-8")

        result = Result(
            task_id=task.id,
            best_score=score,
            pose_paths_json=[str(pose_path.relative_to(Path(settings.object_store_path)))],
            metrics_json={"mock": True},
        )
        session.add(result)

        task.status = "SUCCEEDED"
        task.finished_at = datetime.utcnow()

        log_lines.append(f"Score: {score}")

    except Exception as exc:
        task.status = "FAILED"
        task.finished_at = datetime.utcnow()
        task.error = str(exc)
        log_lines.append(f"ERROR: {exc}")
    finally:
        log_path = Path(settings.object_store_path) / "logs" / f"{task.id}.txt"
        write_log(log_path, log_lines)
        task.log_path = str(log_path.relative_to(Path(settings.object_store_path)))
        session.add(task)
        update_run_counts(session, task.run_id)
        session.commit()


def update_run_counts(session: Session, run_id: str) -> None:
    tasks = session.execute(select(Task).where(Task.run_id == run_id)).scalars().all()
    run = session.get(Run, run_id)
    if not run:
        return
    total = len(tasks)
    done = len([task for task in tasks if task.status == "SUCCEEDED"])
    failed = len([task for task in tasks if task.status == "FAILED"])

    if total and done == total:
        run.status = "SUCCEEDED"
    elif failed and done + failed == total:
        run.status = "FAILED"
    elif any(task.status == "RUNNING" for task in tasks):
        run.status = "RUNNING"
    else:
        run.status = "PENDING"

    run.total_tasks = total
    run.done_tasks = done
    run.failed_tasks = failed
    session.add(run)
