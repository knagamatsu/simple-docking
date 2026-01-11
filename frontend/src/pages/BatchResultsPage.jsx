import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { fetchBatchResults, fetchBatchStatus } from "../api.js";

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "-";
  return score.toFixed(2);
}

export default function BatchResultsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const {
    batchId: contextBatchId,
    setLigandId,
    setSelectedProteins,
    setRunId,
    setBatchId,
    setBatchInput,
    setInputMode
  } = useContext(RunContext);
  const batchId = params.batchId || contextBatchId;
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({ runs: [], name: "", preset: "" });
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  const handleNewBatch = () => {
    setLigandId(null);
    setSelectedProteins([]);
    setRunId(null);
    setBatchId(null);
    setBatchInput({ name: "", format: "csv", text: "" });
    setInputMode("single");
    navigate("/");
  };

  const handleDownload = () => {
    const apiBase = import.meta.env.VITE_API_BASE || "/api";
    window.location.href = `${apiBase}/batches/${batchId}/export?fmt=zip`;
  };

  useEffect(() => {
    if (!batchId) return undefined;
    let active = true;

    const load = async () => {
      try {
        const statusResp = await fetchBatchStatus(batchId);
        const resultsResp = await fetchBatchResults(batchId);
        if (!active) return;
        setStatus(statusResp);
        setResults(resultsResp);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Failed to fetch batch results");
      }
    };

    load();
    const interval = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [batchId]);

  const filteredRuns = useMemo(() => {
    if (!filter) return results.runs;
    return results.runs.filter((run) => run.status === filter);
  }, [results.runs, filter]);

  const topHit = useMemo(() => {
    const scored = results.runs.filter((run) => Number.isFinite(run.best_score));
    if (!scored.length) return null;
    return scored.reduce((best, run) => (run.best_score < best.best_score ? run : best), scored[0]);
  }, [results.runs]);

  if (!batchId) {
    return (
      <section className="panel">
        <h2>No batch selected</h2>
        <p>Upload a batch list first from the Input step.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>4. Batch Results</h2>
          <p className="muted">Batch runs keep each ligand isolated per target panel.</p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div className="status-chip">Batch {status?.status || "PENDING"}</div>
          <button
            onClick={handleDownload}
            className="button-secondary"
            disabled={!status || status.total_runs === 0}
            style={{ opacity: !status || status.total_runs === 0 ? 0.5 : 1 }}
          >
            Download ZIP
          </button>
          <button onClick={handleNewBatch} className="button-secondary">
            New Batch
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {status && (
        <div className="progress-card">
          <div>
            <p className="muted">Runs complete</p>
            <h3>
              {status.done_runs}/{status.total_runs}
            </h3>
            <p className="muted">
              Tasks {status.done_tasks}/{status.total_tasks} · Failed {status.failed_runs}
            </p>
          </div>
          <div className="progress-bar">
            <span
              style={{
                width: status.total_runs ? `${(status.done_runs / status.total_runs) * 100}%` : "0%"
              }}
            />
          </div>
        </div>
      )}

      <div className="results-overview">
        <div className="overview-card">
          <p className="muted">Batch</p>
          <h3>{results.name || "Untitled batch"}</h3>
          <p>Preset: {results.preset || "-"}</p>
        </div>
        <div className="overview-card">
          <p className="muted">Ligands</p>
          <h3>{status?.total_runs ?? 0}</h3>
          <p>
            Completed {status?.done_runs ?? 0} · Failed {status?.failed_runs ?? 0}
          </p>
        </div>
        <div className="overview-card">
          <p className="muted">Top hit</p>
          <h3>{topHit?.ligand_name || "-"}</h3>
          <p>
            Score {formatScore(topHit?.best_score)} · {topHit?.best_protein || "-"}
          </p>
        </div>
      </div>

      <div className="filters">
        <div className="chips">
          {["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED"].map((item) => (
            <button
              key={item || "all"}
              type="button"
              className={filter === item ? "chip active" : "chip"}
              onClick={() => setFilter(item)}
            >
              {item || "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="batch-run-list">
        {filteredRuns.map((run) => (
          <div key={run.run_id} className="batch-run-row">
            <div>
              <h3>{run.ligand_name || `Ligand ${run.ligand_id.slice(0, 8)}`}</h3>
              <p className="muted">
                Best {formatScore(run.best_score)} · {run.best_protein || "No hit yet"}
              </p>
            </div>
            <div className="run-meta">
              <span className={`pill ${run.status?.toLowerCase()}`}>{run.status}</span>
              <span className="muted">
                {run.done_tasks}/{run.total_tasks} complete
              </span>
              <Link className="link" to={`/results/${run.run_id}`}>
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
