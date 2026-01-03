import json
from pathlib import Path


def load_protein_manifest(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_path(base: Path, relative: str) -> Path:
    candidate = (base / relative).resolve()
    if base not in candidate.parents and candidate != base:
        raise ValueError("Path escapes base directory")
    return candidate
