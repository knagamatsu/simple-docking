from app.models import Ligand

def test_reference_ligands_exist(client, db_session):
    # This test assumes seed_ligands has run or we manually seed them.
    # Since tests run with an empty DB usually, we might need to rely on the startup event 
    # or manually trigger seeding/creation here.
    # However, the conftest usually sets up a blank DB.
    # Let's verify we can create a reference ligand and query it.
    
    ref_ligand = Ligand(
        name="Test Reference",
        smiles="CCO",
        input_type="SMILES",
        status="READY",
        is_reference=True,
        reference_label="Standard CCO"
    )
    db_session.add(ref_ligand)
    db_session.commit()
    
    # 1. List all - should include it
    resp = client.get("/ligands")
    assert resp.status_code == 200
    data = resp.json()
    found = next((L for L in data if L["id"] == ref_ligand.id), None)
    assert found is not None
    
    # 2. Filter by is_reference=true
    resp = client.get("/ligands?is_reference=true")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["id"] == ref_ligand.id
    
    # 3. Filter by is_reference=false
    # Add a non-reference ligand
    normal_ligand = Ligand(
        name="Normal Ligand",
        smiles="CCN",
        input_type="SMILES",
        status="READY",
        is_reference=False
    )
    db_session.add(normal_ligand)
    db_session.commit()
    
    resp = client.get("/ligands?is_reference=false")
    assert resp.status_code == 200
    data = resp.json()
    # Should find normal but not reference
    ids = [L["id"] for L in data]
    assert normal_ligand.id in ids
    assert ref_ligand.id not in ids
