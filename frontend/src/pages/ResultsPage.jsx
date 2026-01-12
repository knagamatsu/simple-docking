import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RunContext } from "../App.jsx";
import {
  fetchFile,
  fetchLigand,
  fetchProteinFile,
  fetchRunResults,
  fetchRunStatus,
  listRuns
} from "../api.js";
import Viewer from "../components/Viewer.jsx";
import Structure2D from "../components/Structure2D.jsx";
import { CopyIcon, CheckIcon, DownloadIcon, PlusIcon } from "../components/Icons.jsx";
import Modal from "../components/Modal.jsx";
import OCL from "openchemlib/full";

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

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "-";
  return score.toFixed(2);
}

function formatVector(values) {
  if (!values || !values.length) return "-";
  return values.map((value) => value.toFixed(1)).join(", ");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function formatShortId(value) {
  if (!value) return "-";
  return String(value).slice(0, 8);
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function formatRunOptions(options) {
  if (!options) return "";
  const parts = [];
  if (Number.isFinite(options.num_poses)) parts.push(`Poses ${options.num_poses}`);
  if (Number.isFinite(options.exhaustiveness)) parts.push(`Exhaustiveness ${options.exhaustiveness}`);
  if (Number.isFinite(options.num_conformers)) parts.push(`Conformers ${options.num_conformers}`);
  return parts.join(" · ");
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
  const [historyRuns, setHistoryRuns] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [currentRunMeta, setCurrentRunMeta] = useState(null);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState("markdown");
  const [reportContent, setReportContent] = useState("");
  const [ligandModalOpen, setLigandModalOpen] = useState(false);
  const [ligandModalEntry, setLigandModalEntry] = useState(null);
  const [ligandInfo, setLigandInfo] = useState(null);
  const [derivedSmiles, setDerivedSmiles] = useState("");
  const [ligandLoading, setLigandLoading] = useState(false);
  const [ligandError, setLigandError] = useState("");
  const [ligandCopied, setLigandCopied] = useState(false);

  const handleNewRun = () => {
    setLigandId(null);
    setSelectedProteins([]);
    setRunId(null);
    setBatchId(null);
    setBatchInput({ name: "", format: "csv", text: "" });
    setInputMode("single");
    navigate("/");
  };

  const generateReportText = (format) => {
    const ranking = results.ranking || [];
    const top3 = ranking.slice(0, 3);
    const preset = results.preset || "Balanced";
    const smiles = results.ligand_smiles || "N/A";
    const createdAt = status?.created_at ? formatDate(status.created_at) : formatDate(new Date().toISOString());
    const count = results.per_protein?.length || 0;

    if (format === "markdown") {
      return `## ドッキングシミュレーション結果

### 実行条件
- 実行日時: ${createdAt}
- Run ID: ${runId}
- リガンド (SMILES): ${smiles}
- プリセット: ${preset}
- ターゲット数: ${count}

### 結果サマリー（上位3件）
${top3.length > 0 ? top3.map((r, i) =>
        `${i + 1}. ${r.protein_name}: ${formatScore(r.best_score)} kcal/mol`
      ).join('\n') : '結果なし'}

### 備考
本結果は仮説生成のための参考値であり、実験的検証が必要です。
スコアが低いほど結合親和性が高いことを示唆します。`;
    }

    // Plain text format
    return `【ドッキングシミュレーション結果】

[実行条件]
実行日時: ${createdAt}
Run ID: ${runId}
リガンド: ${smiles}
プリセット: ${preset}
ターゲット数: ${count}

[結果サマリー]
${top3.length > 0 ? top3.map((r, i) =>
      `${i + 1}. ${r.protein_name}: ${formatScore(r.best_score)} kcal/mol`
    ).join('\n') : '結果なし'}

[備考]
本結果は仮説生成のための参考値であり、実験的検証が必要です。
スコアが低いほど結合親和性が高いことを示唆します。`;
  };

  const handleOpenReport = () => {
    setReportContent(generateReportText(reportFormat));
    setReportOpen(true);
  };

  const handleFormatChange = (fmt) => {
    setReportFormat(fmt);
    setReportContent(generateReportText(fmt));
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportContent).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setReportOpen(false);
      }, 1000);
    });
  };

  const handleDownload = () => {
    const apiBase = import.meta.env.VITE_API_BASE || "/api";
    window.location.href = `${apiBase}/runs/${runId}/export?fmt=zip`;
  };

  const handleOpenLigandModal = (entry) => {
    setLigandModalEntry(entry);
    setLigandModalOpen(true);
  };

  const handleCloseLigandModal = () => {
    setLigandModalOpen(false);
    setLigandModalEntry(null);
    setLigandInfo(null);
    setDerivedSmiles("");
    setLigandError("");
    setLigandCopied(false);
  };

  const handleCopyLigandText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setLigandCopied(true);
      setTimeout(() => setLigandCopied(false), 1000);
    });
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

  const targetEntries = useMemo(() => {
    const source = results.per_protein.length ? results.per_protein : results.ranking;
    return [...source].sort((a, b) => a.protein_name.localeCompare(b.protein_name));
  }, [results.per_protein, results.ranking]);

  const selectedResult = useMemo(() => {
    if (!targetEntries.length) return null;
    return targetEntries.find((item) => item.protein_id === selectedProteinId) || targetEntries[0];
  }, [targetEntries, selectedProteinId]);

  useEffect(() => {
    if (!targetEntries.length) return;
    if (!selectedProteinId || !targetEntries.some((item) => item.protein_id === selectedProteinId)) {
      setSelectedProteinId(targetEntries[0].protein_id);
    }
  }, [targetEntries, selectedProteinId]);

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

  useEffect(() => {
    if (!runId || !selectedProteinId) return undefined;
    let active = true;
    setHistoryLoading(true);
    setHistoryError("");

    const loadHistory = async () => {
      try {
        const runs = await listRuns();
        if (!active) return;
        const currentRun = runs.find((run) => run.id === runId) || null;
        if (active) setCurrentRunMeta(currentRun);
        const signature = currentRun
          ? {
            preset: currentRun.preset,
            optionsKey: stableStringify(currentRun.options || {})
          }
          : null;
        const sortedRuns = [...runs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const recentRuns = sortedRuns
          .filter((run) => run.id !== runId)
          .filter((run) => {
            if (!signature) return false;
            return (
              run.preset === signature.preset &&
              stableStringify(run.options || {}) === signature.optionsKey
            );
          })
          .slice(0, 8);
        const historyResults = await Promise.all(
          recentRuns.map(async (run) => {
            try {
              const res = await fetchRunResults(run.id);
              return { run, res };
            } catch (err) {
              return null;
            }
          })
        );
        if (!active) return;
        const entries = historyResults
          .filter(Boolean)
          .map(({ run, res }) => {
            const match = res.per_protein.find((item) => item.protein_id === selectedProteinId);
            if (!match || !Number.isFinite(match.best_score)) return null;
            return {
              runId: run.id,
              createdAt: run.created_at,
              status: run.status,
              bestScore: match.best_score,
              ligandId: run.ligand_id
            };
          })
          .filter(Boolean);
        setHistoryRuns(entries);
      } catch (err) {
        if (!active) return;
        setHistoryError(err.message || "Failed to load history");
        setHistoryRuns([]);
      } finally {
        if (active) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, [runId, selectedProteinId]);



  useEffect(() => {
    if (!ligandModalOpen || !ligandModalEntry) return undefined;
    let active = true;
    setLigandLoading(true);
    setLigandError("");
    setLigandInfo(null);

    const loadLigand = async () => {
      try {
        const ligandPromise = ligandModalEntry.ligandId
          ? fetchLigand(ligandModalEntry.ligandId)
          : Promise.resolve(null);
        const ligand = await ligandPromise;
        if (!active) return;
        setLigandInfo(ligand);
      } catch (err) {
        if (!active) return;
        setLigandError(err.message || "Failed to load ligand details");
      } finally {
        if (active) setLigandLoading(false);
      }
    };

    loadLigand();
    return () => {
      active = false;
    };
  }, [ligandModalOpen, ligandModalEntry]);

  useEffect(() => {
    if (!ligandInfo || ligandInfo.smiles || !ligandInfo.molfile) {
      setDerivedSmiles("");
      return;
    }
    try {
      const molecule = OCL.Molecule.fromMolfile(ligandInfo.molfile);
      setDerivedSmiles(molecule.toSmiles());
    } catch (err) {
      setDerivedSmiles("");
    }
  }, [ligandInfo]);

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
  const poseCount = viewerData.poses.length;
  const hasPoses = poseCount > 0;
  const hasMultiplePoses = poseCount > 1;
  const safePoseIndex = hasPoses ? Math.min(Math.max(0, selectedPoseIndex), poseCount - 1) : 0;
  const selectedPoseScore = poseScores[safePoseIndex];

  const currentBestScore = Number.isFinite(selectedResult?.best_score)
    ? selectedResult.best_score
    : null;
  const historyRows = historyRuns.slice(0, 4);
  const historyBestEntry = useMemo(() => {
    const scored = historyRuns.filter((entry) => Number.isFinite(entry.bestScore));
    if (!scored.length) return null;
    return scored.reduce(
      (best, entry) => (entry.bestScore < best.bestScore ? entry : best),
      scored[0]
    );
  }, [historyRuns]);
  const historyDelta = useMemo(() => {
    if (!historyBestEntry || currentBestScore === null) return null;
    return currentBestScore - historyBestEntry.bestScore;
  }, [historyBestEntry, currentBestScore]);
  const historyDeltaClass = historyDelta === null ? "" : historyDelta < 0 ? "good" : "bad";
  const energyPositions = useMemo(() => {
    if (!historyBestEntry || currentBestScore === null) return null;
    const values = [0, historyBestEntry.bestScore, currentBestScore].filter((value) =>
      Number.isFinite(value)
    );
    if (!values.length) return null;
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const range = maxValue - minValue || 1;
    const positionFor = (value) => {
      const raw = ((maxValue - value) / range) * 100;
      return Math.min(100, Math.max(0, raw));
    };
    return {
      zero: positionFor(0),
      best: positionFor(historyBestEntry.bestScore),
      current: positionFor(currentBestScore),
      maxValue,
      minValue
    };
  }, [historyBestEntry, currentBestScore]);
  const runConditions = useMemo(() => {
    if (!currentRunMeta) return "";
    const parts = [];
    if (currentRunMeta.preset) parts.push(`Preset ${currentRunMeta.preset}`);
    const optionsText = formatRunOptions(currentRunMeta.options);
    if (optionsText) parts.push(optionsText);
    return parts.join(" · ");
  }, [currentRunMeta]);
  const targetLabel = selectedResult?.protein_name ? `Target ${selectedResult.protein_name}` : "";
  const historyMessage = useMemo(() => {
    if (currentBestScore === null) return "No score yet for this target.";
    if (!historyBestEntry) return "No scored runs for this target with the same settings yet.";
    return "";
  }, [currentBestScore, historyBestEntry]);
  const showProgress =
    status && status.status && status.status !== "SUCCEEDED" && status.status !== "FAILED";
  const ligandText = ligandInfo?.smiles || derivedSmiles || ligandInfo?.molfile || "";
  const ligandTextLabel = ligandInfo?.smiles
    ? "SMILES"
    : derivedSmiles
      ? "SMILES (derived)"
      : ligandInfo?.molfile
        ? "Molfile"
        : "Structure";
  const ligandName = ligandInfo?.name
    || (ligandModalEntry?.ligandId ? `Ligand ${formatShortId(ligandModalEntry.ligandId)}` : "Ligand");
  const ligandRunMeta = ligandModalEntry
    ? `Run ${formatShortId(ligandModalEntry.runId)} · ${formatDate(ligandModalEntry.createdAt)}`
    : "";

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
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div className="status-chip">Run {status?.status || "PENDING"}</div>
          <button
            onClick={handleOpenReport}
            className="copy-button"
            disabled={!results.ranking?.length}
          >
            <CopyIcon size={16} /> Copy Report
          </button>
          <button
            onClick={handleDownload}
            className="button-secondary"
            disabled={!status || status.status === "PENDING" || status.done === 0}
            style={{ opacity: (!status || status.status === "PENDING" || status.done === 0) ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <DownloadIcon size={16} /> Download ZIP
          </button>
          <button onClick={handleNewRun} className="button-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <PlusIcon size={16} /> New Run
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {showProgress && (
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
        <aside className="results-sidebar">
          <div className="overview-card history-card">
            <div className="history-header">
              <div>
                <p className="muted">History (same target + settings)</p>
                <h3>Energy diagram</h3>
                {runConditions && <p className="muted">{runConditions}</p>}
                {targetLabel && <p className="muted">{targetLabel}</p>}
              </div>
            </div>
            {historyLoading ? (
              <p className="muted">Loading history...</p>
            ) : historyError ? (
              <p className="error">{historyError}</p>
            ) : (
              <div className="history-grid">
                <div className="energy-diagram">
                  {historyMessage ? (
                    <p className="muted">{historyMessage}</p>
                  ) : (
                    <>
                      <div className="energy-axis">
                        <span
                          className="energy-zero"
                          style={{ top: `${energyPositions?.zero ?? 0}%` }}
                        />
                        <div
                          className="energy-marker best"
                          style={{ top: `${energyPositions?.best ?? 0}%` }}
                        >
                          <span className="energy-dot" />
                          <span className="energy-label">
                            Recent best {formatScore(historyBestEntry?.bestScore)}
                          </span>
                        </div>
                        <div
                          className={`energy-marker current ${historyDeltaClass}`}
                          style={{ top: `${energyPositions?.current ?? 0}%` }}
                        >
                          <span className="energy-dot" />
                          <span className="energy-label">
                            Current {formatScore(currentBestScore)}
                          </span>
                        </div>
                      </div>
                      <div className="energy-caption">
                        <span className="muted">0 kcal/mol baseline (lower is better)</span>
                        {historyDelta !== null && (
                          <span className={`energy-delta ${historyDeltaClass}`}>
                            {historyDelta < 0
                              ? `Δ ${Math.abs(historyDelta).toFixed(2)} better`
                              : `Δ ${historyDelta.toFixed(2)} worse`} kcal/mol
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="history-recent">
                  <div className="history-recent-header">
                    <h4>Recent runs</h4>
                    <span className="muted">Same target + settings</span>
                  </div>
                  {historyRows.length === 0 ? (
                    <p className="muted">No matching runs yet.</p>
                  ) : (
                    <div className="history-list">
                      {historyRows.map((entry) => (
                        <div
                          key={entry.runId}
                          role="button"
                          tabIndex={0}
                          className="history-row"
                          title={`Run ${formatShortId(entry.runId)} · ${formatDate(entry.createdAt)}${entry.ligandId ? ` · Ligand ${formatShortId(entry.ligandId)}` : ""}`}
                          onClick={() => navigate(`/results/${entry.runId}`)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(`/results/${entry.runId}`);
                            }
                          }}
                        >
                          <span className="history-meta">
                            <span className="history-date">{formatDate(entry.createdAt)}</span>
                            <span className="history-id">Run {formatShortId(entry.runId)}</span>
                          </span>
                          <span className="history-actions">
                            <span className="history-score">{formatScore(entry.bestScore)}</span>
                            <button
                              type="button"
                              className="history-ligand-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenLigandModal(entry);
                              }}
                              disabled={!entry.ligandId}
                            >
                              Ligand
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="target-list">
            <h3>Targets</h3>
            <div className="target-list-body">
              {targetEntries.map((item) => (
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
                      Poses {item.pose_paths.length}
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
              <div className="viewer-title">
                <h3 style={{ margin: 0 }}>Pose Viewer</h3>
                <p className="muted">{selectedResult?.protein_name || "Select a target"}</p>
              </div>
              <div className="pose-controls">
                <button
                  onClick={() =>
                    setSelectedPoseIndex((prev) => (hasPoses ? Math.max(0, prev - 1) : 0))
                  }
                  disabled={!hasPoses || safePoseIndex === 0}
                  className="ghost"
                >
                  ← Prev
                </button>
                <button
                  onClick={() =>
                    setSelectedPoseIndex((prev) =>
                      hasPoses ? Math.min(poseCount - 1, prev + 1) : 0
                    )
                  }
                  disabled={!hasPoses || safePoseIndex === poseCount - 1}
                  className="ghost"
                >
                  Next →
                </button>
              </div>
            </div>

            {!hasPoses && <p className="muted viewer-empty">No poses available yet.</p>}

            <Viewer
              receptorText={viewerData.receptor}
              poseText={viewerData.poses[safePoseIndex] || ""}
            />
            <div className="pose-meta">
              <span>Pose {hasPoses ? safePoseIndex + 1 : 0}/{poseCount}</span>
              <span>Score {formatScore(selectedPoseScore)}</span>
              <span>Contacts cutoff {contactCutoff}A</span>
            </div>
            <p className="muted">Click and drag to rotate. Scroll to zoom.</p>

            {hasPoses && (
              <details className="viewer-options">
                <summary>Playback &amp; Poses</summary>
                <div className="viewer-options-body">
                  {hasMultiplePoses && (
                    <div className="pose-playback">
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
                    </div>
                  )}
                  <div className="chips pose-chip-row">
                    {viewerData.poses.map((_, idx) => (
                      <button
                        key={`pose-${idx}`}
                        type="button"
                        className={safePoseIndex === idx ? "chip active" : "chip"}
                        onClick={() => setSelectedPoseIndex(idx)}
                      >
                        Pose {idx + 1}{poseScores[idx] !== undefined ? ` (${formatScore(poseScores[idx])})` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </details>
            )}
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
      <Modal
        title="Ligand details"
        isOpen={ligandModalOpen}
        onClose={handleCloseLigandModal}
      >
        {ligandLoading ? (
          <p className="muted">Loading ligand...</p>
        ) : ligandError ? (
          <p className="error">{ligandError}</p>
        ) : (
          <div className="ligand-modal">
            <div className="ligand-modal-header">
              <div>
                <h4>{ligandName}</h4>
                {ligandRunMeta && <p className="muted">{ligandRunMeta}</p>}
                {targetLabel && <p className="muted">{targetLabel}</p>}
              </div>
              <button
                className="button-secondary"
                onClick={() => handleCopyLigandText(ligandText)}
                disabled={!ligandText}
              >
                {ligandCopied ? "Copied!" : `Copy ${ligandTextLabel}`}
              </button>
            </div>
            <div className="ligand-modal-grid">
              <div className="ligand-structure">
                <p className="muted">2D structure</p>
                <Structure2D
                  smiles={ligandInfo?.smiles}
                  molfile={ligandInfo?.molfile}
                />
              </div>
              <div>
                <p className="muted">{ligandTextLabel}</p>
                {ligandText ? (
                  <textarea
                    className="ligand-textarea"
                    rows={8}
                    value={ligandText}
                    readOnly
                  />
                ) : (
                  <p className="muted">No SMILES or Molfile available.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        title="Copy Report Template"
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
      >
        <div style={{ marginBottom: "16px" }}>
          <p className="muted" style={{ marginBottom: "12px" }}>Select format and edit before copying.</p>
          <div className="segmented" style={{ display: "inline-flex" }}>
            <button
              type="button"
              className={reportFormat === "markdown" ? "active" : ""}
              onClick={() => handleFormatChange("markdown")}
            >
              Markdown
            </button>
            <button
              type="button"
              className={reportFormat === "text" ? "active" : ""}
              onClick={() => handleFormatChange("text")}
            >
              Plain Text
            </button>
          </div>
        </div>
        <textarea
          style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", fontFamily: "monospace", fontSize: "13px", lineHeight: "1.5" }}
          rows={12}
          value={reportContent}
          onChange={(e) => setReportContent(e.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
          <button className="button-secondary" onClick={() => setReportOpen(false)}>Cancel</button>
          <button
            className={copied ? "primary success-pulse" : "primary"} // Assuming success-pulse animation or similar, or just let state handle it
            onClick={handleCopyReport}
            style={{ minWidth: "120px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            {copied ? <><CheckIcon size={16} /> Copied!</> : "Copy to Clipboard"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
