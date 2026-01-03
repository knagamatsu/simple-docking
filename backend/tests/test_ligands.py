def test_create_ligand_and_fetch(client):
    payload = {"name": "Test Ligand", "smiles": "CCO"}
    response = client.post("/ligands", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "ligand_id" in body
    assert body["status"] in {"READY", "PENDING"}

    ligand_id = body["ligand_id"]
    get_resp = client.get(f"/ligands/{ligand_id}")
    assert get_resp.status_code == 200
    ligand = get_resp.json()
    assert ligand["smiles"] == "CCO"
    assert ligand["name"] == "Test Ligand"
