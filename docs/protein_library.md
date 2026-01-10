# Protein Library & Auto Pocket

## Manifest fields
The `protein_library/manifest.json` records can include optional fields to enable
automatic docking boxes when `default_box` is not set.

```
{
  "id": "prot_example",
  "name": "Example kinase",
  "receptor_pdbqt": "receptors/prot_example/receptor.pdbqt",
  "receptor_pdb": "receptors/prot_example/1ABC.pdb",
  "pocket_method": "ligand"
}
```

### Optional keys
- `receptor_pdb`: PDB path used to infer a pocket (relative to `protein_library/`).
- `pocket_pdb`: Explicit PDB path for pocket detection (takes priority over `receptor_pdb`).
- `pocket_method`: `auto`, `ligand`, or `protein` (defaults to `auto`).
- `default_box`: When provided, auto pocket inference is skipped.

### Auto pocket behavior
- `ligand`: Bounding box from `HETATM` atoms (water excluded).
- `protein`: Bounding box from `ATOM` records.
- `auto`: Try ligand first, fall back to protein bbox, then a default box.

## Worker settings
You can tune pocket inference with environment variables on the worker:

```
POCKET_METHOD_DEFAULT=auto
POCKET_PADDING=6.0
POCKET_MIN_SIZE=18.0
POCKET_DEFAULT_SIZE=20.0
```
