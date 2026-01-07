from pathlib import Path

from app.settings import Settings

WATER_RESIDUES = {"HOH", "WAT", "DOD"}


def _parse_coords(pdb_path: Path, record_types: set[str]) -> list[tuple[float, float, float]]:
    coords: list[tuple[float, float, float]] = []
    with pdb_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if len(line) < 54:
                continue
            record = line[0:6].strip()
            if record not in record_types:
                continue
            resname = line[17:20].strip()
            if record == "HETATM" and resname in WATER_RESIDUES:
                continue
            try:
                x = float(line[30:38])
                y = float(line[38:46])
                z = float(line[46:54])
            except ValueError:
                continue
            coords.append((x, y, z))
    return coords


def _compute_box(
    coords: list[tuple[float, float, float]],
    padding: float,
    min_size: float,
) -> dict | None:
    if not coords:
        return None
    xs, ys, zs = zip(*coords)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    size_x = max(max_x - min_x + padding * 2, min_size)
    size_y = max(max_y - min_y + padding * 2, min_size)
    size_z = max(max_z - min_z + padding * 2, min_size)
    return {
        "center": [(min_x + max_x) / 2, (min_y + max_y) / 2, (min_z + max_z) / 2],
        "size": [size_x, size_y, size_z],
    }


def _count_ligand_atoms(pdb_path: Path) -> int:
    count = 0
    with pdb_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.startswith("HETATM"):
                continue
            if len(line) < 20:
                continue
            resname = line[17:20].strip()
            if resname in WATER_RESIDUES:
                continue
            count += 1
    return count


def _pick_pocket_pdb(settings: Settings, protein) -> Path | None:
    base_dir = Path(settings.protein_library_path)
    candidates: list[Path] = []
    meta = protein.receptor_meta_json or {}
    for key in ("pocket_pdb", "receptor_pdb"):
        rel = meta.get(key)
        if rel:
            path = base_dir / rel
            if path.exists():
                candidates.append(path)
    if not candidates:
        receptor_path = base_dir / protein.receptor_pdbqt_path
        if receptor_path.exists():
            candidates = sorted(receptor_path.parent.glob("*.pdb"))
    if not candidates:
        return None
    ranked = sorted(candidates, key=_count_ligand_atoms, reverse=True)
    return ranked[0]


def resolve_box(settings: Settings, protein, log_lines: list[str]) -> tuple[dict, dict]:
    if protein.default_box_json:
        return protein.default_box_json, {"method": "default", "source": "manifest"}

    method = (protein.pocket_method or settings.pocket_method_default).lower()
    pdb_path = _pick_pocket_pdb(settings, protein)
    pdb_source = None
    if pdb_path:
        try:
            pdb_source = str(pdb_path.relative_to(Path(settings.protein_library_path)))
        except ValueError:
            pdb_source = str(pdb_path)

    if pdb_path and method in ("ligand", "auto"):
        ligand_coords = _parse_coords(pdb_path, {"HETATM"})
        box = _compute_box(ligand_coords, settings.pocket_padding, settings.pocket_min_size)
        if box:
            log_lines.append(f"Pocket box from ligand (pdb={pdb_source})")
            return box, {
                "method": "ligand",
                "source": pdb_source,
                "padding": settings.pocket_padding,
                "min_size": settings.pocket_min_size,
            }
        log_lines.append(f"No ligand HETATM found in {pdb_source or 'pdb'}, falling back.")

    if pdb_path and method in ("protein", "auto", "bbox"):
        protein_coords = _parse_coords(pdb_path, {"ATOM"})
        box = _compute_box(protein_coords, settings.pocket_padding, settings.pocket_min_size)
        if box:
            log_lines.append(f"Pocket box from protein bbox (pdb={pdb_source})")
            return box, {
                "method": "protein",
                "source": pdb_source,
                "padding": settings.pocket_padding,
                "min_size": settings.pocket_min_size,
            }
        log_lines.append(f"No protein ATOM found in {pdb_source or 'pdb'}, falling back.")

    fallback = settings.pocket_default_size
    log_lines.append("Using fallback docking box (center 0,0,0).")
    return {
        "center": [0.0, 0.0, 0.0],
        "size": [fallback, fallback, fallback],
    }, {"method": "fallback", "source": pdb_source}
