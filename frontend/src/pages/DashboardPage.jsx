import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRunResults, listBatches, listRuns } from "../api.js";

const PINNED_RUNS_KEY = "simple-docking:pinned-runs";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function loadPinnedRuns() {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PINNED_RUNS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function savePinnedRuns(runIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_RUNS_KEY, JSON.stringify(runIds));
  } catch (err) {
    return;
  }
}

function matchesQuery(query, values) {
  if (!query) return true;
  return values.some((value) => {
    if (!value) return false;
    return String(value).toLowerCase().includes(query);
  });
}

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [batches, setBatches] = useState([]);
  const [runStatus, setRunStatus] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [view, setView] = useState("runs");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [pinnedRuns, setPinnedRuns] = useState(loadPinnedRuns);
  const [summary, setSummary] = useState({
    totalRuns: 0,
    uniqueLigands: 0,
    uniqueTargets: 0,
    totalBatches: 0
  });
  const [summaryError, setSummaryError] = useState("");
  const [batchLookup, setBatchLookup] = useState({});

  const pinnedSet = useMemo(() => new Set(pinnedRuns), [pinnedRuns]);

  useEffect(() => {
    savePinnedRuns(pinnedRuns);
  }, [pinnedRuns]);

  useEffect(() => {
    if (!pinnedRuns.length && showPinnedOnly) {
      setShowPinnedOnly(false);
    }
  }, [pinnedRuns, showPinnedOnly]);

  useEffect(() => {
    if (view !== "runs") {
      setShowPinnedOnly(false);
    }
  }, [view]);

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

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sortByDate = (a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
    };
    let list = runs.filter((run) =>
      matchesQuery(query, [
        run.id,
        run.ligand_id,
        run.batch_id,
        run.preset,
        run.status,
        formatDateTime(run.created_at)
      ])
    );
    if (showPinnedOnly) {
      list = list.filter((run) => pinnedSet.has(run.id));
    }
    list = [...list].sort(sortByDate);
    if (!showPinnedOnly && pinnedSet.size) {
      const pinned = list.filter((run) => pinnedSet.has(run.id));
      const rest = list.filter((run) => !pinnedSet.has(run.id));
      return [...pinned, ...rest];
    }
    return list;
  }, [runs, searchQuery, showPinnedOnly, sortOrder, pinnedSet]);

  const filteredBatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sortByDate = (a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
    };
    return [...batches]
      .filter((batch) =>
        matchesQuery(query, [
          batch.id,
          batch.name,
          batch.preset,
          batch.status,
          formatDateTime(batch.created_at)
        ])
      )
      .sort(sortByDate);
  }, [batches, searchQuery, sortOrder]);

  const togglePinnedRun = (runId) => {
    setPinnedRuns((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      }
      return [...prev, runId];
    });
  };

  const searchPlaceholder = view === "runs"
    ? "Search runs, ligands, presets..."
    : "Search batches, presets...";

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
        <>
          <div className="filters dashboard-filters">
            <div className="search">
              <input
                type="search"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="filter-group">
              <span className="filter-label">Sort</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <button
              type="button"
              className={`chip ${showPinnedOnly ? "active" : ""}`}
              onClick={() => setShowPinnedOnly((prev) => !prev)}
              disabled={!pinnedRuns.length}
              title={pinnedRuns.length ? "Show pinned runs only" : "Pin runs to enable"}
            >
              Pinned
            </button>
          </div>
          <p className="muted filter-summary">
            Showing {filteredRuns.length} of {runs.length} runs
          </p>
          {filteredRuns.length === 0 ? (
            <p className="muted">No runs match the current filters.</p>
          ) : (
            <div className="run-list">
              {filteredRuns.map((run) => {
                const batchMeta = run.batch_id ? batchLookup[run.batch_id] : null;
                const batchLabel = run.batch_id
                  ? batchMeta?.name || `Batch ${run.batch_id.slice(0, 8)}`
                  : "";
                const ligandLabel = run.ligand_id ? `Ligand ${run.ligand_id.slice(0, 8)}` : "";
                const isPinned = pinnedSet.has(run.id);
                return (
                  <div key={run.id} className={`run-row ${isPinned ? "pinned" : ""}`}>
                    <div>
                      <h3>Run {run.id.slice(0, 8)}</h3>
                      <p className="muted">
                        Created {formatDateTime(run.created_at)} · Preset {run.preset}
                        {ligandLabel ? ` · ${ligandLabel}` : ""}
                      </p>
                      {batchLabel && <p className="muted">{batchLabel}</p>}
                    </div>
                    <div className="run-meta">
                      <span className="pill">{run.status}</span>
                      <span className="muted">
                        {run.done_tasks}/{run.total_tasks} complete
                      </span>
                      <button
                        type="button"
                        className={`pin-button ${isPinned ? "active" : ""}`}
                        onClick={() => togglePinnedRun(run.id)}
                      >
                        {isPinned ? "Pinned" : "Pin"}
                      </button>
                      <Link className="link" to={`/results/${run.id}`}>
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="filters dashboard-filters">
            <div className="search">
              <input
                type="search"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="filter-group">
              <span className="filter-label">Sort</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>
          <p className="muted filter-summary">
            Showing {filteredBatches.length} of {batches.length} batches
          </p>
          {filteredBatches.length === 0 ? (
            <p className="muted">No batches match the current filters.</p>
          ) : (
            <div className="run-list">
              {filteredBatches.map((batch) => (
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
        </>
      )}
    </section>
  );
}
