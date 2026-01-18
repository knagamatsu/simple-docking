import React, { useEffect, useRef, useState } from "react";

const SNAPSHOT_DELAY_MS = 150;

function detectPoseFormat(poseText) {
  if (!poseText) return "pdb";
  return poseText.includes("ROOT") || poseText.includes("TORSDOF") ? "pdbqt" : "pdb";
}

function captureSnapshot(viewer) {
  if (!viewer) return "";
  if (typeof viewer.pngURI === "function") {
    return viewer.pngURI();
  }
  const canvas = viewer.renderer?.domElement;
  if (canvas && typeof canvas.toDataURL === "function") {
    return canvas.toDataURL("image/png");
  }
  return "";
}

export default function PoseSnapshot({
  receptorText,
  poseText,
  width = 320,
  height = 220,
  onStatusChange
}) {
  const stageRef = useRef(null);
  const [snapshot, setSnapshot] = useState("");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setSnapshot("");

    if (!receptorText && !poseText) {
      setStatus("empty");
      onStatusChange?.("empty");
      return undefined;
    }
    if (!window.$3Dmol) {
      setStatus("unavailable");
      onStatusChange?.("unavailable");
      return undefined;
    }
    if (!stageRef.current) {
      setStatus("loading");
      onStatusChange?.("loading");
      return undefined;
    }

    setStatus("loading");
    onStatusChange?.("loading");
    stageRef.current.innerHTML = "";
    const viewer = window.$3Dmol.createViewer(stageRef.current, {
      backgroundColor: "#ffffff"
    });

    if (receptorText) {
      viewer.addModel(receptorText, "pdb");
      viewer.setStyle({}, { cartoon: { color: "#5db7a3", opacity: 0.6 } });
    }
    if (poseText) {
      const format = detectPoseFormat(poseText);
      viewer.addModel(poseText, format);
      viewer.setStyle({ hetflag: true }, { stick: { color: "#f3b04b" } });
    }
    viewer.zoomTo();
    viewer.render();

    const timer = setTimeout(() => {
      const dataUrl = captureSnapshot(viewer);
      if (dataUrl) {
        setSnapshot(dataUrl);
        setStatus("ready");
        onStatusChange?.("ready");
      } else {
        setStatus("error");
        onStatusChange?.("error");
      }
    }, SNAPSHOT_DELAY_MS);

    return () => {
      clearTimeout(timer);
      if (stageRef.current) {
        stageRef.current.innerHTML = "";
      }
    };
  }, [receptorText, poseText, onStatusChange]);

  let message = "";
  if (status === "loading") message = "Rendering snapshot...";
  if (status === "empty") message = "No pose available.";
  if (status === "unavailable") message = "3D viewer unavailable.";
  if (status === "error") message = "Failed to render 3D snapshot.";

  return (
    <div className="snapshot-wrapper">
      {snapshot ? (
        <img src={snapshot} alt="Docking pose snapshot" />
      ) : (
        <div className="structure-fallback">{message}</div>
      )}
      <div
        className="snapshot-stage"
        ref={stageRef}
        style={{ width: `${width}px`, height: `${height}px` }}
        aria-hidden="true"
      />
    </div>
  );
}
