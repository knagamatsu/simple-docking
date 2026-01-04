import hashlib
import subprocess
import re
from datetime import datetime
from pathlib import Path
from typing import Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session
from meeko import MoleculePreparation
from rdkit import Chem
from rdkit.Chem import AllChem

from app.models import Ligand, LigandConformer, Protein, Result, Run, Task
from app.settings import Settings


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_log(log_path: Path, lines: list[str]) -> None:
    ensure_dir(log_path.parent)
    log_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate_pdb_block(ligand: Ligand) -> str:
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


def prepare_conformer_pdbqt(
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

    if not pdbqt_path.exists():
        # Load molecule for Meeko
        mol = None
        if ligand.smiles:
            mol = Chem.MolFromSmiles(ligand.smiles)
        elif ligand.molfile:
            mol = Chem.MolFromMolBlock(ligand.molfile)
        
        if mol:
            mol = Chem.AddHs(mol)
            AllChem.EmbedMolecule(mol)
            
            # Meeko preparation
            preparator = MoleculePreparation()
            preparator.prepare(mol)
            pdbqt_string = preparator.write_pdbqt_string()
            
            pdbqt_path.write_text(pdbqt_string, encoding="utf-8")
            
            # Also save PDB for reference if needed
            Chem.MolToPDBFile(mol, str(pdb_path))
            
            log_lines.append(f"Generated PDBQT for conformer {conformer.idx}")

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

        ligand_pdbqt: Path = None
        if conformer:
            _, ligand_pdbqt = prepare_conformer_pdbqt(settings, session, ligand, conformer, log_lines)
        else:
            # Fallback for on-the-fly prep
            pass 

        receptor_path = Path(settings.protein_library_path) / protein.receptor_pdbqt_path
        if not receptor_path.exists():
            raise RuntimeError(f"Receptor file not found: {receptor_path}")

        # Vina Setup via Subprocess
        box = protein.default_box_json or {}
        center = box.get("center", [0, 0, 0])
        size = box.get("size", [20, 20, 20])
        
        pose_dir = Path(settings.object_store_path) / "poses" / task.id
        ensure_dir(pose_dir)
        pose_path = pose_dir / "pose_0.pdbqt"

        cmd = [
            "vina",
            "--receptor", str(receptor_path),
            "--ligand", str(ligand_pdbqt),
            "--center_x", str(center[0]),
            "--center_y", str(center[1]),
            "--center_z", str(center[2]),
            "--size_x", str(size[0]),
            "--size_y", str(size[1]),
            "--size_z", str(size[2]),
            "--exhaustiveness", "8",
            "--out", str(pose_path)
        ]
        
        log_lines.append(f"Running Vina: {' '.join(cmd)}")
        result_proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        log_lines.append(result_proc.stdout)
        
        # Parse score from output or file. Vina stdout usually has a table.
        # Format:
        # mode |   affinity | dist from best mode
        #      | (kcal/mol) | rmsd l.b.| rmsd u.b.
        # -----+------------+----------+----------
        #    1 |     -7.5   |      0.000 |      0.000
        
        best_score = 0.0
        match = re.search(r"^\s*1\s+([-\d.]+)\s+", result_proc.stdout, re.MULTILINE)
        if match:
            best_score = float(match.group(1))

        result = Result(
            task_id=task.id,
            best_score=best_score,
            pose_paths_json=[str(pose_path.relative_to(Path(settings.object_store_path)))],
            metrics_json={"engine": "vina", "exhaustiveness": 8},
        )
        session.add(result)

        task.status = "SUCCEEDED"
        task.finished_at = datetime.utcnow()

        log_lines.append(f"Vina finished. Best score: {best_score}")

    except subprocess.CalledProcessError as cpe:
        task.status = "FAILED"
        task.finished_at = datetime.utcnow()
        task.error = f"Vina crashed: {cpe.stderr}"
        log_lines.append(f"ERROR: {cpe.stderr}")
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
