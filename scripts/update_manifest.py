#!/usr/bin/env python3
"""
Update manifest.json with kinase data
"""
import json
from pathlib import Path

# Full kinase metadata
KINASE_METADATA = {
    "prot_cdk2": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1M17",
        "notes": "Cell cycle regulator, cancer target"
    },
    "prot_egfr": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:4I23",
        "notes": "Epidermal growth factor receptor, cancer target"
    },
    "prot_src": {
        "category": "Kinase",
        "organism": "Gallus gallus",
        "source_id": "PDB:2SRC",
        "notes": "Proto-oncogene, cancer target"
    },
    "prot_pka": {
        "category": "Kinase",
        "organism": "Mus musculus",
        "source_id": "PDB:1ATP",
        "notes": "Signal transduction, classical kinase example"
    },
    "prot_abl": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1IEP",
        "notes": "BCR-ABL fusion protein, leukemia target"
    }
}

def main():
    # Read kinase results
    results_path = Path(__file__).parent / "kinase_results.json"
    with open(results_path) as f:
        kinase_results = json.load(f)

    # Build manifest entries
    manifest_entries = []
    for kinase in kinase_results:
        protein_id = kinase["id"]
        metadata = KINASE_METADATA[protein_id]

        entry = {
            "id": protein_id,
            "name": kinase["name"],
            "category": metadata["category"],
            "organism": metadata["organism"],
            "source_id": metadata["source_id"],
            "receptor_pdbqt": f"receptors/{protein_id}/receptor.pdbqt",
            "default_box": {
                "center": kinase["center"],
                "size": kinase["box_size"]
            },
            "notes": metadata["notes"]
        }
        manifest_entries.append(entry)

    # Write manifest
    manifest_path = Path(__file__).parent.parent / "protein_library" / "manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest_entries, f, indent=2)

    print("✓ Updated manifest.json with 5 kinase structures")
    print("\nAdded proteins:")
    for entry in manifest_entries:
        print(f"  - {entry['name']} ({entry['source_id']})")

if __name__ == "__main__":
    main()
