#!/usr/bin/env python3
"""
Download and prepare kinase structures for docking
"""
import urllib.request
import json
from pathlib import Path

KINASES = [
    {
        "id": "prot_cdk2",
        "pdb_id": "1M17",
        "name": "CDK2 (Cyclin-dependent kinase 2)",
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1M17",
        "notes": "Cell cycle regulator, cancer target"
    },
    {
        "id": "prot_egfr",
        "pdb_id": "4I23",
        "name": "EGFR kinase domain",
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:4I23",
        "notes": "Epidermal growth factor receptor, cancer target"
    },
    {
        "id": "prot_src",
        "pdb_id": "2SRC",
        "name": "Src tyrosine kinase",
        "category": "Kinase",
        "organism": "Gallus gallus",
        "source_id": "PDB:2SRC",
        "notes": "Proto-oncogene, cancer target"
    },
    {
        "id": "prot_pka",
        "pdb_id": "1ATP",
        "name": "PKA (cAMP-dependent protein kinase)",
        "category": "Kinase",
        "organism": "Mus musculus",
        "source_id": "PDB:1ATP",
        "notes": "Signal transduction, classical kinase example"
    },
    {
        "id": "prot_abl",
        "pdb_id": "1IEP",
        "name": "ABL tyrosine kinase",
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1IEP",
        "notes": "BCR-ABL fusion protein, leukemia target"
    }
]

def download_pdb(pdb_id: str, output_path: Path):
    """Download PDB file from RCSB"""
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    print(f"Downloading {pdb_id} from {url}...")
    urllib.request.urlretrieve(url, output_path)
    print(f"  Saved to {output_path}")

def main():
    base_dir = Path(__file__).parent.parent / "protein_library" / "receptors"

    for kinase in KINASES:
        pdb_id = kinase["pdb_id"]
        protein_id = kinase["id"]

        # Create directory
        protein_dir = base_dir / protein_id
        protein_dir.mkdir(parents=True, exist_ok=True)

        # Download PDB
        pdb_path = protein_dir / f"{pdb_id}.pdb"
        if not pdb_path.exists():
            download_pdb(pdb_id, pdb_path)

        print(f"✓ {kinase['name']}")

    print("\n" + "="*60)
    print("Downloaded all PDB structures!")
    print("Next step: Convert to PDBQT format")
    print("="*60)

if __name__ == "__main__":
    main()
