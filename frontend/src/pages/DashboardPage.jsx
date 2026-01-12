import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRunResults, listBatches, listRuns } from "../api.js";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [runStatus, setRunStatus] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [view, setView] = useState("runs");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({
    totalRuns: 0,
    uniqueLigands: 0,
    uniqueTargets: 0,
    totalBatches: 0
  });
  const [summaryError, setSummaryError] = useState("");
  const [batchLookup, setBatchLookup] = useState({});

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

  useEffect(() => {
    let active = true;
    setSummaryError("");

    const loadSummary = async () => {
      try {
        const [allRuns, allBatches] = await Promise.all([listRuns(), listBatches()]);
        if (!active) return;
        const uniqueLigands = new Set(
          allRuns.map((run) => run.ligand_id).filter(Boolean)
        );
        const targetIds = new Set();
        await Promise.allSettled(
          allRuns.map(async (run) => {
            try {
              const res = await fetchRunResults(run.id);
              (res.per_protein || []).forEach((item) => {
                if (item.protein_id) targetIds.add(item.protein_id);
              });
            } catch (err) {
              return null;
            }
            return null;
          })
        );
        if (!active) return;
        setSummary({
          totalRuns: allRuns.length,
          uniqueLigands: uniqueLigands.size,
          uniqueTargets: targetIds.size,
          totalBatches: allBatches.length
        });
        const lookup = allBatches.reduce((acc, batch) => {
          acc[batch.id] = batch;
          return acc;
        }, {});
        setBatchLookup(lookup);
      } catch (err) {
        if (!active) return;
        setSummaryError(err.message || "Failed to load summary");
      }
    };

    loadSummary();
    return () => {
      active = false;
    };
  }, []);

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

      {summaryError && <div className="error">{summaryError}</div>}

      <div className="results-overview dashboard-summary">
        <div className="overview-card">
          <p className="muted">Runs</p>
          <h3>{summary.totalRuns}</h3>
        </div>
        <div className="overview-card">
          <p className="muted">Ligands</p>
          <h3>{summary.uniqueLigands}</h3>
        </div>
        <div className="overview-card">
          <p className="muted">Targets</p>
          <h3>{summary.uniqueTargets}</h3>
        </div>
        <div className="overview-card">
          <p className="muted">Batches</p>
          <h3>{summary.totalBatches}</h3>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {view === "runs" ? (
        <div className="run-list">
          {runs.map((run) => {
            const batchMeta = run.batch_id ? batchLookup[run.batch_id] : null;
            const batchLabel = run.batch_id
              ? batchMeta?.name || `Batch ${run.batch_id.slice(0, 8)}`
              : "";
            return (
              <div key={run.id} className="run-row">
                <div>
                  <h3>Run {run.id.slice(0, 8)}</h3>
                  <p className="muted">
                    Created {formatDateTime(run.created_at)} · Preset {run.preset}
                  </p>
                  {batchLabel && <p className="muted">{batchLabel}</p>}
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
            );
          })}
        </div>
      ) : (
        <div className="run-list">
          {batches.map((batch) => (
            <div key={batch.id} className="run-row">
              <div>
                <h3>{batch.name || `Batch ${batch.id.slice(0, 8)}`}</h3>
                <p className="muted">
                  Created {formatDateTime(batch.created_at)} · Preset {batch.preset}
                </p>
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
