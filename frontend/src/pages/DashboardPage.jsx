import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBatches, listRuns } from "../api.js";

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [runStatus, setRunStatus] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [view, setView] = useState("runs");
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    if (view === "runs") {
      listRuns(runStatus)
        .then(setRuns)
        .catch((err) => setError(err.message || "Failed to load runs"));
    } else {
      listBatches(batchStatus)
        .then(setBatches)
        .catch((err) => setError(err.message || "Failed to load batches"));
    }
  }, [runStatus, batchStatus, view]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Run Dashboard</h2>
          <p>Track progress and review runs or batches.</p>
        </div>
        <div className="dashboard-controls">
          <div className="segmented">
            <button
              type="button"
              className={view === "runs" ? "active" : ""}
              onClick={() => setView("runs")}
            >
              Runs
            </button>
            <button
              type="button"
              className={view === "batches" ? "active" : ""}
              onClick={() => setView("batches")}
            >
              Batches
            </button>
          </div>
          <div className="chips">
            {["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED"].map((item) => (
              <button
                key={item || "all"}
                type="button"
                className={(view === "runs" ? runStatus : batchStatus) === item ? "chip active" : "chip"}
                onClick={() => (view === "runs" ? setRunStatus(item) : setBatchStatus(item))}
              >
                {item || "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {view === "runs" ? (
        <div className="run-list">
          {runs.map((run) => (
            <div key={run.id} className="run-row">
              <div>
                <h3>Run {run.id.slice(0, 8)}</h3>
                <p className="muted">Preset: {run.preset}</p>
                {run.batch_id && <p className="muted">Batch: {run.batch_id.slice(0, 8)}</p>}
              </div>
              <div className="run-meta">
                <span className="pill">{run.status}</span>
                <span className="muted">
                  {run.done_tasks}/{run.total_tasks} complete
                </span>
                <Link className="link" to={`/results/${run.id}`}>
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="run-list">
          {batches.map((batch) => (
            <div key={batch.id} className="run-row">
              <div>
                <h3>{batch.name || `Batch ${batch.id.slice(0, 8)}`}</h3>
                <p className="muted">Preset: {batch.preset}</p>
              </div>
              <div className="run-meta">
                <span className="pill">{batch.status}</span>
                <span className="muted">
                  {batch.done_runs}/{batch.total_runs} complete
                </span>
                <Link className="link" to={`/batch/${batch.id}`}>
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
