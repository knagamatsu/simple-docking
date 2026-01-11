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


class ProteinImportRequest(BaseModel):
    pdb_id: str
    name: Optional[str] = None
    category: Optional[str] = None
    organism: Optional[str] = None


class ProteinPasteRequest(BaseModel):
    name: Optional[str] = None
    pdb_text: str
    category: Optional[str] = None
    organism: Optional[str] = None


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


class BatchCreate(BaseModel):
    name: Optional[str] = None
    protein_ids: List[str]
    preset: str
    options: Optional[dict[str, Any]] = None
    format: Optional[str] = None
    text: Optional[str] = None
    ligands: Optional[List[LigandCreate]] = None


class BatchCreateResponse(BaseModel):
    batch_id: str
    run_count: int
    ligand_count: int


class BatchSummary(BaseModel):
    id: str
    created_at: datetime
    name: Optional[str] = None
    preset: str
    status: str
    total_runs: int
    done_runs: int
    failed_runs: int
    total_tasks: int
    done_tasks: int
    failed_tasks: int


class BatchStatusResponse(BaseModel):
    status: str
    total_runs: int
    done_runs: int
    failed_runs: int
    total_tasks: int
    done_tasks: int
    failed_tasks: int


class BatchRunEntry(BaseModel):
    run_id: str
    ligand_id: str
    ligand_name: Optional[str] = None
    best_score: Optional[float] = None
    best_protein: Optional[str] = None
    status: str
    total_tasks: int
    done_tasks: int
    failed_tasks: int


class BatchResultsResponse(BaseModel):
    batch_id: str
    name: Optional[str] = None
    preset: str
    status: BatchStatusResponse
    runs: List[BatchRunEntry]


class RunResultEntry(BaseModel):
    protein_id: str
    protein_name: str
    best_score: Optional[float] = None
    percentile: Optional[float] = None
    pose_paths: List[str] = Field(default_factory=list)
    status: str
    error: Optional[str] = None
    receptor_pdbqt_path: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None


class RunResultsResponse(BaseModel):
    ranking: List[RunResultEntry]
    per_protein: List[RunResultEntry]


class TaskOut(BaseModel):
    id: str
    status: str
    error: Optional[str] = None
    log_path: Optional[str] = None
