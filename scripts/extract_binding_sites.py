#!/usr/bin/env python3
"""
Extract binding site coordinates from PDB ligands (HETATM records)
"""
from pathlib import Path
import json
import re

KINASES = [
    {
        "id": "prot_cdk2",
        "pdb_id": "1M17",
        "name": "CDK2 (Cyclin-dependent kinase 2)",
        "ligand_name": "ATP",  # ATP analog (DT5)
    },
    {
        "id": "prot_egfr",
        "pdb_id": "4I23",
        "name": "EGFR kinase domain",
        "ligand_name": "03P",  # Inhibitor
    },
    {
        "id": "prot_src",
        "pdb_id": "2SRC",
        "name": "Src tyrosine kinase",
        "ligand_name": "ANP",  # ATP analog
    },
    {
        "id": "prot_pka",
        "pdb_id": "1ATP",
        "name": "PKA (cAMP-dependent protein kinase)",
        "ligand_name": "ATP",  # ATP
    },
    {
        "id": "prot_abl",
        "pdb_id": "1IEP",
        "name": "ABL tyrosine kinase",
        "ligand_name": "PRC",  # Peptide substrate
    }
]

def extract_ligand_center(pdb_path):
    """Extract center coordinates of HETATM ligands (excluding water)"""
    hetatm_coords = []
    ligands_found = set()

    with open(pdb_path) as f:
        for line in f:
            if line.startswith("HETATM"):
                # Extract residue name (columns 18-20)
                residue_name = line[17:20].strip()

                # Skip water and common artifacts
                if residue_name in ["HOH", "WAT", "SO4", "PO4", "GOL", "EDO"]:
                    continue

                ligands_found.add(residue_name)

                try:
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    hetatm_coords.append([x, y, z])
                except ValueError:
                    continue

    if not hetatm_coords:
        return None, list(ligands_found)

    # Calculate center of all HETATM atoms
    center = [
        sum(c[0] for c in hetatm_coords) / len(hetatm_coords),
        sum(c[1] for c in hetatm_coords) / len(hetatm_coords),
        sum(c[2] for c in hetatm_coords) / len(hetatm_coords)
    ]

    return center, list(ligands_found)

def calculate_binding_box_size(pdb_path, center):
    """Calculate optimal box size based on ligand extent plus buffer"""
    hetatm_coords = []

    with open(pdb_path) as f:
        for line in f:
            if line.startswith("HETATM"):
                residue_name = line[17:20].strip()
                if residue_name in ["HOH", "WAT", "SO4", "PO4", "GOL", "EDO"]:
                    continue

                try:
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    hetatm_coords.append([x, y, z])
                except ValueError:
                    continue

    if not hetatm_coords:
        # Default size for kinases
        return [20.0, 20.0, 20.0]

    # Calculate extent of ligand
    min_coords = [min(c[0] for c in hetatm_coords),
                  min(c[1] for c in hetatm_coords),
                  min(c[2] for c in hetatm_coords)]
    max_coords = [max(c[0] for c in hetatm_coords),
                  max(c[1] for c in hetatm_coords),
                  max(c[2] for c in hetatm_coords)]

    ligand_extent = [
        max_coords[0] - min_coords[0],
        max_coords[1] - min_coords[1],
        max_coords[2] - min_coords[2]
    ]

    # Add 10Å buffer on each side (20Å total per dimension)
    # Minimum 18Å to ensure coverage
    buffer = 20.0
    box_size = [
        max(18.0, ligand_extent[0] + buffer),
        max(18.0, ligand_extent[1] + buffer),
        max(18.0, ligand_extent[2] + buffer)
    ]

    return box_size

def main():
    base_dir = Path(__file__).parent.parent / "protein_library" / "receptors"
    results = []

    print("Extracting binding sites from PDB ligands...\n")

    for kinase in KINASES:
        pdb_id = kinase["pdb_id"]
        protein_id = kinase["id"]
        protein_dir = base_dir / protein_id
        pdb_path = protein_dir / f"{pdb_id}.pdb"

        print(f"Processing {kinase['name']}...")
        print(f"  PDB: {pdb_id}")

        # Extract ligand center
        center, ligands_found = extract_ligand_center(pdb_path)

        if center is None:
            print(f"  ⚠ No ligands found in {pdb_id}")
            # Fallback to geometric center
            continue

        print(f"  Ligands found: {', '.join(ligands_found)}")
        print(f"  Expected ligand: {kinase.get('ligand_name', 'Unknown')}")

        # Calculate optimal box size
        box_size = calculate_binding_box_size(pdb_path, center)

        print(f"  Binding site center: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f})")
        print(f"  Box size: ({box_size[0]:.2f}, {box_size[1]:.2f}, {box_size[2]:.2f}) Å")
        print(f"  ✓ Extracted real binding site\n")

        results.append({
            "id": protein_id,
            "name": kinase["name"],
            "pdb_id": pdb_id,
            "center": center,
            "box_size": box_size,
            "ligands_found": ligands_found,
            "expected_ligand": kinase.get("ligand_name", "Unknown")
        })

    # Save results
    results_path = Path(__file__).parent / "binding_sites.json"
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)

    print("="*60)
    print("Binding site extraction complete!")
    print(f"Results saved to {results_path}")
    print("\nSummary:")
    for result in results:
        print(f"  {result['name']}: {', '.join(result['ligands_found'])}")
    print("="*60)

if __name__ == "__main__":
    main()
