from pathlib import Path

from app.models import Protein
import app.main as main


PDB_SAMPLE = """HEADER    TEST PDB
ATOM      1  N   ALA A   1      11.104  13.207  10.000  1.00 20.00           N
ATOM      2  CA  ALA A   1      12.000  14.000  10.500  1.00 20.00           C
END
"""


class DummyResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def read(self) -> bytes:
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_create_protein_from_pdb_paste(client, db_session):
    response = client.post(
        "/proteins/paste",
        json={"name": "Custom PDB", "pdb_text": PDB_SAMPLE},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Custom PDB"
    assert body["category"] == "Custom"

    protein = db_session.get(Protein, body["id"])
    assert protein is not None

    base_dir = Path(client.app.state.settings.protein_library_path)
    assert (base_dir / protein.receptor_pdbqt_path).exists()


def test_create_protein_from_pdb_paste_requires_atoms(client):
    response = client.post(
        "/proteins/paste",
        json={"name": "Invalid", "pdb_text": "HEADER ONLY"},
    )
    assert response.status_code == 400


def test_import_protein_from_pdb_id(client, monkeypatch):
    def fake_urlopen(url, timeout=10):
        return DummyResponse(PDB_SAMPLE.encode("utf-8"))

    monkeypatch.setattr(main.urllib_request, "urlopen", fake_urlopen)

    response = client.post("/proteins/import", json={"pdb_id": "1abc"})
    assert response.status_code == 200
    body = response.json()
    assert body["source_id"] == "PDB:1ABC"

    response_repeat = client.post("/proteins/import", json={"pdb_id": "1ABC"})
    assert response_repeat.status_code == 200
    assert response_repeat.json()["id"] == body["id"]
