from sqlalchemy import select

from app.models import Batch, Protein, Run, Task


def test_create_batch_from_csv(client, db_session):
    protein = Protein(
        id="prot_batch",
        name="Batch Protein",
        category="Kinase",
        organism="Homo sapiens",
        source_id="PDB:BATCH",
        receptor_pdbqt_path="receptors/prot_batch/receptor.pdbqt",
        default_box_json={"center": [0.0, 0.0, 0.0], "size": [20.0, 20.0, 20.0]},
        status="READY",
    )
    db_session.add(protein)
    db_session.commit()

    csv_text = "name,smiles\nLigand A,CCO\nLigand B,CN\n"
    response = client.post(
        "/batches",
        json={
            "name": "Batch 1",
            "protein_ids": ["prot_batch"],
            "preset": "Fast",
            "format": "csv",
            "text": csv_text,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["run_count"] == 2
    assert payload["ligand_count"] == 2

    batch_id = payload["batch_id"]
    batch = db_session.get(Batch, batch_id)
    assert batch is not None
    assert batch.name == "Batch 1"

    runs = db_session.execute(select(Run).where(Run.batch_id == batch_id)).scalars().all()
    assert len(runs) == 2

    tasks = db_session.execute(
        select(Task).where(Task.run_id.in_([run.id for run in runs]))
    ).scalars().all()
    assert len(tasks) == 10

    list_resp = client.get("/batches")
    assert list_resp.status_code == 200
    batches = list_resp.json()
    assert batches[0]["total_runs"] == 2

    status_resp = client.get(f"/batches/{batch_id}/status")
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["total_runs"] == 2
    assert status["total_tasks"] == 10

    results_resp = client.get(f"/batches/{batch_id}/results")
    assert results_resp.status_code == 200
    results = results_resp.json()
    assert results["batch_id"] == batch_id
    assert len(results["runs"]) == 2
