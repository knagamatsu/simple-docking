import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { fetchFile, fetchProteinFile, fetchRunResults, fetchRunStatus } from "../api.js";
import Viewer from "../components/Viewer.jsx";

export default function ResultsPage() {
  const params = useParams();
  const { runId: contextRunId } = useContext(RunContext);
  const runId = params.runId || contextRunId;
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({ ranking: [], per_protein: [] });
  const [viewerData, setViewerData] = useState({ receptor: "", pose: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!runId) return undefined;
    let active = true;

    const load = async () => {
      try {
        const statusResp = await fetchRunStatus(runId);
        const resultsResp = await fetchRunResults(runId);
        if (!active) return;
        setStatus(statusResp);
        setResults(resultsResp);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Failed to fetch results");
      }
    };

    load();
    const interval = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId]);

  const topResult = useMemo(() => results.ranking[0], [results]);

  useEffect(() => {
    if (!topResult) return;
    const loadViewer = async () => {
      try {
        const [receptor, pose] = await Promise.all([
          topResult.receptor_pdbqt_path
            ? fetchProteinFile(topResult.receptor_pdbqt_path)
            : "",
          topResult.pose_paths?.[0] ? fetchFile(topResult.pose_paths[0]) : ""
        ]);
        setViewerData({ receptor, pose });
      } catch (err) {
        setViewerData({ receptor: "", pose: "" });
      }
    };
    loadViewer();
  }, [topResult]);

  if (!runId) {
    return (
      <section className="panel">
        <h2>No run selected</h2>
        <p>Create a run first from the Settings step.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>4. Results</h2>
          <p className="muted">Docking scores are for hypothesis generation only.</p>
        </div>
        <div className="status-chip">Run {status?.status || "PENDING"}</div>
      </div>

      {error && <div className="error">{error}</div>}

      {status && (
        <div className="progress-card">
          <div>
            <p className="muted">Progress</p>
            <h3>
              {status.done}/{status.total} complete
            </h3>
          </div>
          <div className="progress-bar">
            <span
              style={{
                width: status.total ? `${(status.done / status.total) * 100}%` : "0%"
              }}
            />
          </div>
        </div>
      )}

      <div className="results-layout">
        <div>
          <h3>Ranking</h3>
          <table className="results-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.ranking.map((item) => (
                <tr key={item.protein_id}>
                  <td>{item.protein_name}</td>
                  <td>{item.best_score ?? "-"}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="section-gap">Target Cards</h3>
          <div className="card-grid">
            {results.per_protein.map((item) => (
              <div key={item.protein_id} className="mini-card">
                <div className="mini-card-header">
                  <div>
                    <h4>{item.protein_name}</h4>
                    <p className="muted">Score: {item.best_score ?? "-"}</p>
                  </div>
                  <span className={`pill ${item.status?.toLowerCase()}`}>{item.status}</span>
                </div>
                {item.error && <p className="error">{item.error}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="viewer-card">
          <h3>Top Pose Viewer</h3>
          <Viewer receptorText={viewerData.receptor} poseText={viewerData.pose} />
          <p className="muted">Click and drag to rotate. Scroll to zoom.</p>
        </div>
      </div>
    </section>
  );
}
