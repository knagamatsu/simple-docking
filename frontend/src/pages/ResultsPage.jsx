import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { fetchFile, fetchProteinFile, fetchRunResults, fetchRunStatus } from "../api.js";
import Viewer from "../components/Viewer.jsx";

const CONTACT_CUTOFFS = [3.5, 4.0, 5.0];
const SPEED_OPTIONS = [
  { label: "Slow", value: 2000 },
  { label: "Normal", value: 1200 },
  { label: "Fast", value: 700 }
];

const METALS = new Set(["FE", "ZN", "MG", "MN", "CA", "NA", "K", "CU", "CO", "NI"]);
const HALOGENS = new Set(["F", "CL", "BR", "I"]);
const POLARS = new Set(["N", "O", "S", "P"]);

function normalizeElement(raw) {
  if (!raw) return "X";
  const cleaned = raw.replace(/[^A-Za-z]/g, "");
  if (!cleaned) return "X";
  const upper = cleaned.toUpperCase();
  const pdbqtMap = {
    A: "C",
    NA: "N",
    OA: "O",
    SA: "S",
    HD: "H"
  };
  if (pdbqtMap[upper]) return pdbqtMap[upper];
  const twoLetter = upper.slice(0, 2);
  if (METALS.has(twoLetter) || HALOGENS.has(twoLetter)) return twoLetter;
  return upper[0];
}

function parsePdbqtAtoms(text) {
  if (!text) return [];
  const atoms = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.length < 54) continue;
    const record = line.slice(0, 6).trim();
    if (record !== "ATOM" && record !== "HETATM") continue;
    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const rawElement = line.slice(76, 78).trim() || line.trim().split(/\s+/).slice(-1)[0];
    const element = normalizeElement(rawElement);
    atoms.push({
      x,
      y,
      z,
      element,
      resname: line.slice(17, 20).trim(),
      resid: line.slice(22, 26).trim()
    });
  }
  return atoms;
}

function classifyContact(ligEl, recEl) {
  if (METALS.has(ligEl) || METALS.has(recEl)) return "metal";
  if (HALOGENS.has(ligEl) || HALOGENS.has(recEl)) return "halogen";
  if (POLARS.has(ligEl) || POLARS.has(recEl)) return "polar";
  if (ligEl === "C" && recEl === "C") return "hydrophobic";
  return "other";
}

function computeInteractionSummary(ligAtoms, recAtoms, cutoff) {
  if (!ligAtoms.length || !recAtoms.length) return null;
  const cutoffSq = cutoff * cutoff;
  const counts = {
    polar: 0,
    hydrophobic: 0,
    halogen: 0,
    metal: 0,
    other: 0
  };
  let minDistanceSq = Infinity;
  let contactPairs = 0;
  const residueMap = new Map();

  for (const lig of ligAtoms) {
    for (const rec of recAtoms) {
      const dx = lig.x - rec.x;
      const dy = lig.y - rec.y;
      const dz = lig.z - rec.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < minDistanceSq) minDistanceSq = distSq;
      if (distSq <= cutoffSq) {
        contactPairs += 1;
        counts[classifyContact(lig.element, rec.element)] += 1;
        if (rec.resname) {
          const key = rec.resid ? `${rec.resname} ${rec.resid}` : rec.resname;
          residueMap.set(key, (residueMap.get(key) || 0) + 1);
        }
      }
    }
  }

  const topResidues = Array.from(residueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  return {
    counts,
    contactPairs,
    minDistance: minDistanceSq === Infinity ? null : Math.sqrt(minDistanceSq),
    topResidues
  };
}

function buildHistogram(scores, binCount = 8) {
  if (!scores.length) return { bins: [], min: 0, max: 0 };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (min === max) {
    return {
      bins: [{ min, max, count: scores.length }],
      min,
      max
    };
  }
  const step = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, idx) => ({
    min: min + step * idx,
    max: min + step * (idx + 1),
    count: 0
  }));
  for (const score of scores) {
    const idx = Math.min(binCount - 1, Math.floor((score - min) / step));
    bins[idx].count += 1;
  }
  return { bins, min, max };
}

function computeScoreStats(scores) {
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
    mean,
    count: sorted.length
  };
}

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "-";
  return score.toFixed(2);
}

function formatVector(values) {
  if (!values || !values.length) return "-";
  return values.map((value) => value.toFixed(1)).join(", ");
}

export default function ResultsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const {
    runId: contextRunId,
    setLigandId,
    setSelectedProteins,
    setRunId,
    setBatchId,
    setBatchInput,
    setInputMode
  } = useContext(RunContext);
  const runId = params.runId || contextRunId;
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({ ranking: [], per_protein: [] });
  const [viewerData, setViewerData] = useState({ receptor: "", poses: [] });
  const [selectedProteinId, setSelectedProteinId] = useState(null);
  const [selectedPoseIndex, setSelectedPoseIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(SPEED_OPTIONS[1].value);
  const [contactCutoff, setContactCutoff] = useState(CONTACT_CUTOFFS[1]);
  const [error, setError] = useState("");

  const handleNewRun = () => {
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
    window.location.href = `${apiBase}/runs/${runId}/export?fmt=zip`;
  };

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

  useEffect(() => {
    if (!results.ranking.length) return;
    if (!selectedProteinId || !results.ranking.some((item) => item.protein_id === selectedProteinId)) {
      setSelectedProteinId(results.ranking[0].protein_id);
    }
  }, [results.ranking, selectedProteinId]);

  const selectedResult = useMemo(() => {
    if (!results.ranking.length) return null;
    return results.ranking.find((item) => item.protein_id === selectedProteinId) || results.ranking[0];
  }, [results.ranking, selectedProteinId]);

  useEffect(() => {
    if (!selectedResult) return;
    setAutoPlay(false);
    const loadViewer = async () => {
      try {
        const receptor = selectedResult.receptor_pdbqt_path
          ? await fetchProteinFile(selectedResult.receptor_pdbqt_path)
          : "";

        const poses = selectedResult.pose_paths
          ? await Promise.all(
              selectedResult.pose_paths.map((path) => fetchFile(path).catch(() => ""))
            )
          : [];

        setViewerData({ receptor, poses });
        setSelectedPoseIndex(0);
      } catch (err) {
        setViewerData({ receptor: "", poses: [] });
      }
    };
    loadViewer();
  }, [selectedResult]);

  useEffect(() => {
    if (!autoPlay || viewerData.poses.length <= 1) return undefined;
    const interval = setInterval(() => {
      setSelectedPoseIndex((prev) => (prev + 1) % viewerData.poses.length);
    }, autoPlaySpeed);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlaySpeed, viewerData.poses.length]);

  const scoreValues = useMemo(
    () => results.ranking.map((item) => item.best_score).filter((score) => Number.isFinite(score)),
    [results.ranking]
  );
  const scoreStats = useMemo(() => computeScoreStats(scoreValues), [scoreValues]);
  const scoreHistogram = useMemo(() => buildHistogram(scoreValues, 8), [scoreValues]);
  const maxBinCount = Math.max(1, ...scoreHistogram.bins.map((bin) => bin.count));
  const scoreAxisMin = scoreValues.length ? formatScore(scoreHistogram.min) : "-";
  const scoreAxisMax = scoreValues.length ? formatScore(scoreHistogram.max) : "-";

  const receptorAtoms = useMemo(() => parsePdbqtAtoms(viewerData.receptor), [viewerData.receptor]);
  const poseAtoms = useMemo(
    () => parsePdbqtAtoms(viewerData.poses[selectedPoseIndex] || ""),
    [viewerData.poses, selectedPoseIndex]
  );
  const interactionSummary = useMemo(
    () => computeInteractionSummary(poseAtoms, receptorAtoms, contactCutoff),
    [poseAtoms, receptorAtoms, contactCutoff]
  );

  const poseScores = selectedResult?.metrics?.pose_scores || [];
  const selectedPoseScore = poseScores[selectedPoseIndex];

  const completedTargets = results.per_protein.filter((item) => item.status === "SUCCEEDED").length;
  const failedTargets = results.per_protein.filter((item) => item.status === "FAILED").length;

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
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div className="status-chip">Run {status?.status || "PENDING"}</div>
          <button
            onClick={handleDownload}
            className="button-secondary"
            disabled={!status || status.status === "PENDING" || status.done === 0}
            style={{ opacity: (!status || status.status === "PENDING" || status.done === 0) ? 0.5 : 1 }}
          >
            Download ZIP
          </button>
          <button onClick={handleNewRun} className="button-secondary">
            New Run
          </button>
        </div>
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

      <div className="results-overview">
        <div className="overview-card">
          <p className="muted">Top hit</p>
          <h3>{results.ranking[0]?.protein_name || "-"}</h3>
          <p>Best score: {formatScore(results.ranking[0]?.best_score)}</p>
        </div>
        <div className="overview-card">
          <p className="muted">Targets</p>
          <h3>{results.ranking.length}</h3>
          <p>
            Completed {completedTargets}/{results.ranking.length} · Failed {failedTargets}
          </p>
        </div>
        <div className="overview-card">
          <p className="muted">Score summary</p>
          <h3>{scoreStats ? formatScore(scoreStats.median) : "-"}</h3>
          <p>
            Range {scoreStats ? `${formatScore(scoreStats.min)} to ${formatScore(scoreStats.max)}` : "-"}
          </p>
        </div>
        <div className="overview-card score-card">
          <p className="muted">Score distribution</p>
          <div className="score-histogram">
            {scoreHistogram.bins.map((bin, idx) => (
              <div
                key={`bin-${idx}`}
                className="score-bar"
                title={`${formatScore(bin.min)} to ${formatScore(bin.max)} (${bin.count})`}
                style={{ height: `${(bin.count / maxBinCount) * 100}%` }}
              />
            ))}
          </div>
          <div className="score-axis">
            <span>{scoreAxisMin}</span>
            <span>{scoreAxisMax}</span>
          </div>
        </div>
      </div>

      <div className="results-layout">
        <aside className="results-sidebar">
          <div className="target-list">
            <h3>Targets</h3>
            <div className="target-list-body">
              {results.ranking.map((item) => (
                <button
                  key={item.protein_id}
                  type="button"
                  className={
                    item.protein_id === selectedResult?.protein_id
                      ? "target-row active"
                      : "target-row"
                  }
                  onClick={() => setSelectedProteinId(item.protein_id)}
                >
                  <div>
                    <h4>{item.protein_name}</h4>
                    <p className="muted">
                      Score {formatScore(item.best_score)} · Poses {item.pose_paths.length}
                    </p>
                  </div>
                  <span className={`pill ${item.status?.toLowerCase()}`}>{item.status}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mini-card">
            <h3>Run notes</h3>
            {results.per_protein.filter((item) => item.error).length === 0 ? (
              <p className="muted">No errors reported for this run.</p>
            ) : (
              results.per_protein
                .filter((item) => item.error)
                .map((item) => (
                  <div key={`error-${item.protein_id}`} className="note-row">
                    <strong>{item.protein_name}</strong>
                    <p className="error">{item.error}</p>
                  </div>
                ))
            )}
          </div>
        </aside>

        <div>
          <div className="viewer-card">
            <div className="viewer-header">
              <div>
                <h3 style={{ margin: 0 }}>Pose Viewer</h3>
                <p className="muted">{selectedResult?.protein_name || "Select a target"}</p>
              </div>
              <div className="pose-controls">
                {viewerData.poses.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAutoPlay((prev) => !prev)}
                      className="ghost"
                    >
                      {autoPlay ? "Pause" : "Play"}
                    </button>
                    <select
                      value={autoPlaySpeed}
                      onChange={(event) => setAutoPlaySpeed(Number(event.target.value))}
                    >
                      {SPEED_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  onClick={() => setSelectedPoseIndex((prev) => Math.max(0, prev - 1))}
                  disabled={selectedPoseIndex === 0}
                  className="ghost"
                >
                  ←
                </button>
                <button
                  onClick={() =>
                    setSelectedPoseIndex((prev) => Math.min(viewerData.poses.length - 1, prev + 1))
                  }
                  disabled={selectedPoseIndex === viewerData.poses.length - 1}
                  className="ghost"
                >
                  →
                </button>
              </div>
            </div>

            <div className="chips pose-chip-row">
              {viewerData.poses.length === 0 && <span className="muted">No poses available yet.</span>}
              {viewerData.poses.map((_, idx) => (
                <button
                  key={`pose-${idx}`}
                  type="button"
                  className={selectedPoseIndex === idx ? "chip active" : "chip"}
                  onClick={() => setSelectedPoseIndex(idx)}
                >
                  Pose {idx + 1}{poseScores[idx] !== undefined ? ` (${formatScore(poseScores[idx])})` : ""}
                </button>
              ))}
            </div>

            <Viewer
              receptorText={viewerData.receptor}
              poseText={viewerData.poses[selectedPoseIndex] || ""}
            />
            <div className="pose-meta">
              <span>Pose {viewerData.poses.length ? selectedPoseIndex + 1 : 0}/{viewerData.poses.length}</span>
              <span>Score {formatScore(selectedPoseScore)}</span>
              <span>Contacts cutoff {contactCutoff}A</span>
            </div>
            <p className="muted">Click and drag to rotate. Scroll to zoom.</p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <p className="muted">Status</p>
              <h4>{selectedResult?.status || "-"}</h4>
              <p>Best score: {formatScore(selectedResult?.best_score)}</p>
            </div>
            <div className="detail-card">
              <p className="muted">Docking</p>
              <h4>{selectedResult?.metrics?.engine || "vina"}</h4>
              <p>
                Exhaustiveness {selectedResult?.metrics?.exhaustiveness ?? "-"} · Poses {viewerData.poses.length}
              </p>
            </div>
            <div className="detail-card">
              <p className="muted">Pocket</p>
              <h4>{selectedResult?.metrics?.pocket?.method || "-"}</h4>
              <p>Source: {selectedResult?.metrics?.pocket?.source || "-"}</p>
            </div>
            <div className="detail-card">
              <p className="muted">Box</p>
              <h4>Center</h4>
              <p>{formatVector(selectedResult?.metrics?.box?.center)}</p>
              <p>Size {formatVector(selectedResult?.metrics?.box?.size)}</p>
            </div>
          </div>

          <div className="interaction-card">
            <div className="interaction-header">
              <h3>Interaction Map</h3>
              <div className="chips">
                {CONTACT_CUTOFFS.map((value) => (
                  <button
                    key={`cutoff-${value}`}
                    type="button"
                    className={contactCutoff === value ? "chip active" : "chip"}
                    onClick={() => setContactCutoff(value)}
                  >
                    {value}A
                  </button>
                ))}
              </div>
            </div>
            {!interactionSummary ? (
              <p className="muted">Interaction map will appear after poses are loaded.</p>
            ) : (
              <>
                <div className="interaction-grid">
                  {Object.entries(interactionSummary.counts).map(([label, count]) => (
                    <div key={label} className="interaction-row">
                      <span className="interaction-label">{label}</span>
                      <div className="interaction-bar">
                        <span
                          style={{
                            width: `${interactionSummary.contactPairs ? (count / interactionSummary.contactPairs) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="interaction-count">{count}</span>
                    </div>
                  ))}
                </div>
                <div className="interaction-meta">
                  <span>Closest contact: {interactionSummary.minDistance ? interactionSummary.minDistance.toFixed(2) : "-"}A</span>
                  <span>Total contacts: {interactionSummary.contactPairs}</span>
                </div>
                <div className="residue-list">
                  <p className="muted">Top contacting residues</p>
                  {interactionSummary.topResidues.length === 0 ? (
                    <p className="muted">No residue contacts detected.</p>
                  ) : (
                    interactionSummary.topResidues.map((residue) => (
                      <div key={residue.label} className="residue-row">
                        <span>{residue.label}</span>
                        <span>{residue.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
