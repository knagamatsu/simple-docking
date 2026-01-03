import React, { useEffect, useRef } from "react";

export default function Viewer({ receptorText, poseText }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!window.$3Dmol) return;

    containerRef.current.innerHTML = "";
    const viewer = window.$3Dmol.createViewer(containerRef.current, {
      backgroundColor: "#0b0f14"
    });

    if (receptorText) {
      viewer.addModel(receptorText, "pdb"); // Receptor is usually PDB or PDBQT. 3Dmol.js auto-detects often but 'pdb' is safe for typical PDBs.
      viewer.setStyle({}, { cartoon: { color: "#5db7a3" } });
    }
    if (poseText) {
      // Auto-detect format based on content or prop could be better, but assuming pdbqt if it looks like one
      const format = poseText.includes("ROOT") || poseText.includes("TORSDOF") ? "pdbqt" : "pdb";
      viewer.addModel(poseText, format);
      viewer.setStyle({ resn: "LIG" }, { stick: { color: "#f3b04b" } });
      viewer.setStyle({ hetflag: true }, { stick: { color: "#f3b04b" } }); // Fallback
    }
    viewer.zoomTo();
    viewer.render();
  }, [receptorText, poseText]);

  if (!window.$3Dmol) {
    return <div className="viewer-fallback">3D viewer unavailable.</div>;
  }

  return <div className="viewer" ref={containerRef} />;
}
