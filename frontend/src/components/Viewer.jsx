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
      viewer.addModel(receptorText, "pdb");
      viewer.setStyle({}, { cartoon: { color: "#5db7a3" } });
    }
    if (poseText) {
      viewer.addModel(poseText, "pdb");
      viewer.setStyle({ resn: "LIG" }, { stick: { color: "#f3b04b" } });
      viewer.setStyle({ hetflag: true }, { stick: { color: "#f3b04b" } });
    }
    viewer.zoomTo();
    viewer.render();
  }, [receptorText, poseText]);

  if (!window.$3Dmol) {
    return <div className="viewer-fallback">3D viewer unavailable.</div>;
  }

  return <div className="viewer" ref={containerRef} />;
}
