from app.models import Protein, Run


def test_create_run_and_status(client, db_session):
    protein = Protein(
        id="prot_test",
        name="Test Protein",
        category="Kinase",
        organism="Homo sapiens",
        source_id="PDB:TEST",
        receptor_pdbqt_path="receptors/prot_test/receptor.pdbqt",
        default_box_json={"center": [0.0, 0.0, 0.0], "size": [20.0, 20.0, 20.0]},
        status="READY",
    )
    db_session.add(protein)
    db_session.commit()

    ligand_resp = client.post("/ligands", json={"name": "Ligand", "smiles": "CCO"})
    ligand_id = ligand_resp.json()["ligand_id"]

    run_resp = client.post(
        "/runs",
        json={"ligand_id": ligand_id, "protein_ids": ["prot_test"], "preset": "Fast"},
    )
    assert run_resp.status_code == 200
    run_id = run_resp.json()["run_id"]

    run = db_session.get(Run, run_id)
    assert run.options_json["num_conformers"] == 5
    assert run.options_json["exhaustiveness"] == 4
    assert run.options_json["num_poses"] == 5

    status_resp = client.get(f"/runs/{run_id}/status")
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["total"] == 5
    assert status["done"] == 0
    assert status["failed"] == 0

    results_resp = client.get(f"/runs/{run_id}/results")
    assert results_resp.status_code == 200
    results = results_resp.json()
    assert "ranking" in results
    assert "per_protein" in results


def test_run_options_override(client, db_session):
    protein = Protein(
        id="prot_override",
        name="Override Protein",
        category="Kinase",
        organism="Homo sapiens",
        source_id="PDB:OVRD",
        receptor_pdbqt_path="receptors/prot_override/receptor.pdbqt",
        default_box_json={"center": [0.0, 0.0, 0.0], "size": [20.0, 20.0, 20.0]},
        status="READY",
    )
    db_session.add(protein)
    db_session.commit()

    ligand_resp = client.post("/ligands", json={"name": "Ligand", "smiles": "CCO"})
    ligand_id = ligand_resp.json()["ligand_id"]

    run_resp = client.post(
        "/runs",
        json={
            "ligand_id": ligand_id,
            "protein_ids": ["prot_override"],
            "preset": "Fast",
            "options": {"num_conformers": 2, "num_poses": 4, "exhaustiveness": 6},
        },
    )
    assert run_resp.status_code == 200
    run_id = run_resp.json()["run_id"]

    run = db_session.get(Run, run_id)
    assert run.options_json["num_conformers"] == 2
    assert run.options_json["num_poses"] == 4
    assert run.options_json["exhaustiveness"] == 6

    status_resp = client.get(f"/runs/{run_id}/status")
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["total"] == 2
