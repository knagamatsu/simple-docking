from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


def _json_type():
    return JSONB().with_variant(JSON(), "sqlite")


class Ligand(Base):
    __tablename__ = "ligands"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    name = Column(String, nullable=True)
    input_type = Column(String, nullable=True)
    smiles = Column(Text, nullable=True)
    molfile = Column(Text, nullable=True)
    status = Column(String, default="READY", nullable=False)
    error = Column(Text, nullable=True)
    
    # Reference compound fields
    is_reference = Column(Boolean, default=False, nullable=False)
    target_protein_id = Column(String, nullable=True)
    reference_label = Column(String, nullable=True)

    conformers = relationship("LigandConformer", back_populates="ligand")


class LigandConformer(Base):
    __tablename__ = "ligand_conformers"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    ligand_id = Column(String, ForeignKey("ligands.id"), nullable=False)
    idx = Column(Integer, nullable=False)
    pdb_path = Column(Text, nullable=True)
    pdbqt_path = Column(Text, nullable=True)
    status = Column(String, default="PENDING", nullable=False)

    ligand = relationship("Ligand", back_populates="conformers")


class Protein(Base):
    __tablename__ = "proteins"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    organism = Column(String, nullable=True)
    source_id = Column(String, nullable=True)
    receptor_pdbqt_path = Column(Text, nullable=False)
    receptor_meta_json = Column(_json_type(), nullable=True)
    default_box_json = Column(_json_type(), nullable=True)
    pocket_method = Column(String, nullable=True)
    status = Column(String, default="READY", nullable=False)


class Batch(Base):
    __tablename__ = "batches"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    name = Column(String, nullable=True)
    preset = Column(String, nullable=False)
    options_json = Column(_json_type(), nullable=True)


class Run(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ligand_id = Column(String, ForeignKey("ligands.id"), nullable=False)
    batch_id = Column(String, ForeignKey("batches.id"), nullable=True)
    preset = Column(String, nullable=False)
    options_json = Column(_json_type(), nullable=True)
    status = Column(String, default="PENDING", nullable=False)
    total_tasks = Column(Integer, default=0, nullable=False)
    done_tasks = Column(Integer, default=0, nullable=False)
    failed_tasks = Column(Integer, default=0, nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    run_id = Column(String, ForeignKey("runs.id"), nullable=False)
    protein_id = Column(String, ForeignKey("proteins.id"), nullable=False)
    conformer_id = Column(String, ForeignKey("ligand_conformers.id"), nullable=True)
    status = Column(String, default="PENDING", nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)
    log_path = Column(Text, nullable=True)


class Result(Base):
    __tablename__ = "results"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    best_score = Column(Float, nullable=True)
    pose_paths_json = Column(_json_type(), nullable=True)
    metrics_json = Column(_json_type(), nullable=True)


class ProteinBaseline(Base):
    __tablename__ = "protein_baselines"

    protein_id = Column(String, ForeignKey("proteins.id"), primary_key=True)
    method = Column(String, primary_key=True)
    quantiles_json = Column(_json_type(), nullable=True)
    mean = Column(Float, nullable=True)
    std = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
