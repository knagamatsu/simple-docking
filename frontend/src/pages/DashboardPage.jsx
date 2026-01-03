import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRuns } from "../api.js";

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listRuns(status)
      .then(setRuns)
      .catch((err) => setError(err.message || "Failed to load runs"));
  }, [status]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Run Dashboard</h2>
          <p>Track progress and review past runs.</p>
        </div>
        <div className="chips">
          {["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED"].map((item) => (
            <button
              key={item || "all"}
              type="button"
              className={status === item ? "chip active" : "chip"}
              onClick={() => setStatus(item)}
            >
              {item || "All"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="run-list">
        {runs.map((run) => (
          <div key={run.id} className="run-row">
            <div>
              <h3>Run {run.id.slice(0, 8)}</h3>
              <p className="muted">Preset: {run.preset}</p>
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
    </section>
  );
}
