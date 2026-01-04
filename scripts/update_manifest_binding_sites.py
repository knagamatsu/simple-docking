#!/usr/bin/env python3
"""
Update manifest.json with real binding site coordinates
"""
import json
from pathlib import Path

# Full kinase metadata
KINASE_METADATA = {
    "prot_cdk2": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1M17",
        "notes": "Cell cycle regulator, cancer target. Binding site from AQ4 (ATP analog)"
    },
    "prot_egfr": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:4I23",
        "notes": "Epidermal growth factor receptor, cancer target. Binding site from 1C9 (inhibitor)"
    },
    "prot_src": {
        "category": "Kinase",
        "organism": "Gallus gallus",
        "source_id": "PDB:2SRC",
        "notes": "Proto-oncogene, cancer target. Binding site from ANP (ATP analog)"
    },
    "prot_pka": {
        "category": "Kinase",
        "organism": "Mus musculus",
        "source_id": "PDB:1ATP",
        "notes": "Signal transduction, classical kinase example. Binding site from ATP"
    },
    "prot_abl": {
        "category": "Kinase",
        "organism": "Homo sapiens",
        "source_id": "PDB:1IEP",
        "notes": "BCR-ABL fusion protein, leukemia target. Binding site from STI (Gleevec/Imatinib)"
    }
}

def main():
    # Read binding sites results
    results_path = Path(__file__).parent / "binding_sites.json"
    with open(results_path) as f:
        binding_sites = json.load(f)

    # Build manifest entries
    manifest_entries = []
    for site in binding_sites:
        protein_id = site["id"]
        metadata = KINASE_METADATA[protein_id]

        entry = {
            "id": protein_id,
            "name": site["name"],
            "category": metadata["category"],
            "organism": metadata["organism"],
            "source_id": metadata["source_id"],
            "receptor_pdbqt": f"receptors/{protein_id}/receptor.pdbqt",
            "default_box": {
                "center": site["center"],
                "size": site["box_size"]
            },
            "notes": metadata["notes"]
        }
        manifest_entries.append(entry)

    # Write manifest
    manifest_path = Path(__file__).parent.parent / "protein_library" / "manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest_entries, f, indent=2)

    print("✓ Updated manifest.json with real binding sites")
    print("\nBinding sites updated:")
    for entry in manifest_entries:
        center = entry["default_box"]["center"]
        size = entry["default_box"]["size"]
        print(f"  {entry['name']}:")
        print(f"    Center: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f})")
        print(f"    Size: ({size[0]:.1f} × {size[1]:.1f} × {size[2]:.1f}) Å")

if __name__ == "__main__":
    main()
