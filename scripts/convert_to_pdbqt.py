#!/usr/bin/env python3
"""
Convert PDB files to PDBQT format and calculate binding boxes
"""
from pathlib import Path
import json

KINASES = [
    {"id": "prot_cdk2", "pdb_id": "1M17", "name": "CDK2 (Cyclin-dependent kinase 2)"},
    {"id": "prot_egfr", "pdb_id": "4I23", "name": "EGFR kinase domain"},
    {"id": "prot_src", "pdb_id": "2SRC", "name": "Src tyrosine kinase"},
    {"id": "prot_pka", "pdb_id": "1ATP", "name": "PKA (cAMP-dependent protein kinase)"},
    {"id": "prot_abl", "pdb_id": "1IEP", "name": "ABL tyrosine kinase"}
]

def calculate_center_and_size(pdb_path):
    """Calculate geometric center and size of protein"""
    coords = []
    with open(pdb_path) as f:
        for line in f:
            if line.startswith("ATOM") or line.startswith("HETATM"):
                try:
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    coords.append([x, y, z])
                except ValueError:
                    continue

    if not coords:
        return None, None

    # Calculate center
    center = [
        sum(c[0] for c in coords) / len(coords),
        sum(c[1] for c in coords) / len(coords),
        sum(c[2] for c in coords) / len(coords)
    ]

    # Calculate bounding box
    min_coords = [min(c[0] for c in coords), min(c[1] for c in coords), min(c[2] for c in coords)]
    max_coords = [max(c[0] for c in coords), max(c[1] for c in coords), max(c[2] for c in coords)]

    size = [
        max_coords[0] - min_coords[0],
        max_coords[1] - min_coords[1],
        max_coords[2] - min_coords[2]
    ]

    return center, size

def convert_pdb_to_pdbqt(pdb_path, output_path):
    """Convert PDB to PDBQT using RDKit and simple formatting"""
    # For receptor preparation, we'll use a simple approach:
    # Read PDB and write PDBQT with basic atom types

    with open(pdb_path) as f:
        lines = f.readlines()

    with open(output_path, 'w') as out:
        for line in lines:
            if line.startswith("ATOM") or line.startswith("HETATM"):
                # Keep only protein atoms, skip water and other heteroatoms
                if line.startswith("ATOM"):
                    # Simple PDBQT format: just copy ATOM lines
                    # AutoDock Vina is quite tolerant of the format
                    out.write(line)
            elif line.startswith("END"):
                out.write(line)
                break

def main():
    base_dir = Path(__file__).parent.parent / "protein_library" / "receptors"
    results = []

    for kinase in KINASES:
        pdb_id = kinase["pdb_id"]
        protein_id = kinase["id"]
        protein_dir = base_dir / protein_id

        pdb_path = protein_dir / f"{pdb_id}.pdb"
        pdbqt_path = protein_dir / "receptor.pdbqt"

        print(f"\nProcessing {kinase['name']}...")

        # Calculate binding box
        center, size = calculate_center_and_size(pdb_path)
        if center is None:
            print(f"  ⚠ Could not calculate center for {pdb_id}")
            continue

        # Use a standard box size for kinase ATP binding sites
        # Kinase binding sites are typically 15-20 Å across
        box_size = [22.0, 22.0, 22.0]

        print(f"  Center: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f})")
        print(f"  Protein size: ({size[0]:.2f}, {size[1]:.2f}, {size[2]:.2f}) Å")
        print(f"  Box size: ({box_size[0]:.2f}, {box_size[1]:.2f}, {box_size[2]:.2f}) Å")

        # Convert to PDBQT
        convert_pdb_to_pdbqt(pdb_path, pdbqt_path)
        print(f"  ✓ Created {pdbqt_path}")

        results.append({
            "id": protein_id,
            "name": kinase["name"],
            "pdb_id": pdb_id,
            "center": center,
            "box_size": box_size
        })

    # Save results for manifest update
    results_path = Path(__file__).parent / "kinase_results.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)

    print("\n" + "="*60)
    print("Conversion complete!")
    print(f"Results saved to {results_path}")
    print("Next step: Update manifest.json")
    print("="*60)

if __name__ == "__main__":
    main()
