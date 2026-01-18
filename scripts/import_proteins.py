import json
import os
from pathlib import Path

from sqlalchemy import select

from backend.app.db import create_engine_from_settings, create_session_factory
from backend.app.models import Protein
from backend.app.settings import Settings


def main():
    settings = Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite+pysqlite:///./docking.db"),
        protein_library_path=os.getenv("PROTEIN_LIBRARY_PATH", "./protein_library"),
    )

    manifest_path = Path(settings.protein_library_path) / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"manifest not found: {manifest_path}")

    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)

    with manifest_path.open("r", encoding="utf-8") as handle:
        records = json.load(handle)

    with session_factory() as session:
        for record in records:
            protein = session.execute(
                select(Protein).where(Protein.id == record["id"])
            ).scalar_one_or_none()
            if protein is None:
                protein = Protein(id=record["id"], name=record["name"])

            protein.name = record["name"]
            protein.category = record.get("category")
            protein.organism = record.get("organism")
            protein.source_id = record.get("source_id")
            protein.receptor_pdbqt_path = record["receptor_pdbqt"]
            protein.default_box_json = record.get("default_box")
            protein.pocket_method = record.get("pocket_method")
            meta = {"notes": record.get("notes")}
            if record.get("receptor_pdb"):
                meta["receptor_pdb"] = record.get("receptor_pdb")
            if record.get("pocket_pdb"):
                meta["pocket_pdb"] = record.get("pocket_pdb")
            protein.receptor_meta_json = meta
            protein.status = "READY"
            session.add(protein)
        session.commit()


if __name__ == "__main__":
    main()
