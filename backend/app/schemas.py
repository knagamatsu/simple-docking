from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class LigandCreate(BaseModel):
    name: Optional[str] = None
    smiles: Optional[str] = None
    molfile: Optional[str] = None


class LigandOut(BaseModel):
    id: str
    created_at: datetime
    name: Optional[str] = None
    smiles: Optional[str] = None
    molfile: Optional[str] = None
    status: str
    error: Optional[str] = None


class LigandCreateResponse(BaseModel):
    ligand_id: str
    status: str


class ProteinOut(BaseModel):
    id: str
    name: str
    category: Optional[str] = None
    organism: Optional[str] = None
    source_id: Optional[str] = None


class RunCreate(BaseModel):
    ligand_id: str
    protein_ids: List[str]
    preset: str
    options: Optional[dict[str, Any]] = None


class RunCreateResponse(BaseModel):
    run_id: str


class RunStatusResponse(BaseModel):
    status: str
    total: int
    done: int
    failed: int
    running: List[str]


class RunResultEntry(BaseModel):
    protein_id: str
    protein_name: str
    best_score: Optional[float] = None
    percentile: Optional[float] = None
    pose_paths: List[str] = Field(default_factory=list)
    status: str
    error: Optional[str] = None
    receptor_pdbqt_path: Optional[str] = None


class RunResultsResponse(BaseModel):
    ranking: List[RunResultEntry]
    per_protein: List[RunResultEntry]


class TaskOut(BaseModel):
    id: str
    status: str
    error: Optional[str] = None
    log_path: Optional[str] = None
