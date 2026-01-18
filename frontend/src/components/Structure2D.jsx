import React, { useEffect, useState } from "react";
import OCL from "openchemlib/full";

export default function Structure2D({ smiles, molfile, width = 320, height = 220 }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSvg("");
    setError("");
    const source = molfile || smiles;
    if (!source) return;

    try {
      const molecule = molfile
        ? OCL.Molecule.fromMolfile(molfile)
        : OCL.Molecule.fromSmiles(smiles);
      molecule.addImplicitHydrogens();
      molecule.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);
      const svgText = molecule.toSVG(width, height);
      setSvg(svgText);
    } catch (err) {
      setError("Failed to render 2D structure.");
    }
  }, [smiles, molfile, width, height]);

  if (!smiles && !molfile) {
    return <div className="structure-fallback">No structure available.</div>;
  }

  if (error) {
    return <div className="structure-fallback">{error}</div>;
  }

  if (!svg) {
    return <div className="structure-fallback">Rendering structure...</div>;
  }

  return (
    <div
      className="structure-svg"
      aria-label="Ligand 2D structure"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
