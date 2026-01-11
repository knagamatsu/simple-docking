import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { createBatch, createRun } from "../api.js";

const PRESETS = [
  {
    id: "Fast",
    title: "Fast",
    subtitle: "Quick scan for hypothesis surfacing",
    details: "Fewer conformers, lower exhaustiveness"
  },
  {
    id: "Balanced",
    title: "Balanced",
    subtitle: "Daily workflow default",
    details: "Balanced conformers and poses"
  },
  {
    id: "Thorough",
    title: "Thorough",
    subtitle: "Deeper docking exploration",
    details: "More conformers, slower runtime"
  }
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    ligandId,
    selectedProteins,
    preset,
    setPreset,
    setRunId,
    inputMode,
    batchInput,
    setBatchId
  } = useContext(RunContext);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (inputMode === "batch") {
      if (!batchInput?.text || selectedProteins.length === 0) {
        setError("Please upload a batch list and select targets first.");
        return;
      }
    } else if (!ligandId || selectedProteins.length === 0) {
      setError("Please set a ligand and select targets first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (inputMode === "batch") {
        const response = await createBatch({
          name: batchInput?.name || undefined,
          protein_ids: selectedProteins,
          preset,
          format: batchInput?.format,
          text: batchInput?.text
        });
        setBatchId(response.batch_id);
        setRunId(null);
        navigate(`/batch/${response.batch_id}`);
      } else {
        const response = await createRun({
          ligand_id: ligandId,
          protein_ids: selectedProteins,
          preset
        });
        setRunId(response.run_id);
        setBatchId(null);
        navigate(`/results/${response.run_id}`);
      }
    } catch (err) {
      setError(err.message || "Failed to start run");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>3. Run Settings</h2>
          <p>Choose a preset to balance speed and detail.</p>
        </div>
      </div>

      <div className="preset-grid">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={preset === item.id ? "card active" : "card"}
            onClick={() => setPreset(item.id)}
          >
            <h3>{item.title}</h3>
            <p>{item.subtitle}</p>
            <p className="muted">{item.details}</p>
          </button>
        ))}
      </div>

      {inputMode === "batch" && (
        <div className="batch-summary">
          <div>
            <p className="muted">Batch name</p>
            <h4>{batchInput?.name || "Untitled batch"}</h4>
          </div>
          <div>
            <p className="muted">Format</p>
            <h4>{batchInput?.format?.toUpperCase() || "-"}</h4>
          </div>
        </div>
      )}

      <div className="advanced">
        <button type="button" className="ghost" onClick={() => setAdvancedOpen(!advancedOpen)}>
          {advancedOpen ? "Hide" : "Show"} Advanced Options
        </button>
        {advancedOpen && (
          <div className="advanced-body">
            <div className="advanced-grid">
              <label>
                Seed
                <input placeholder="Random" disabled />
              </label>
              <label>
                Timeout (sec)
                <input placeholder="300" disabled />
              </label>
              <label>
                Box override
                <input placeholder="Auto" disabled />
              </label>
              <label>
                pH / tautomer
                <input placeholder="Auto" disabled />
              </label>
            </div>
            <p className="muted">Advanced controls are intentionally hidden for MVP safety.</p>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="primary" type="button" onClick={handleRun} disabled={loading}>
          {loading ? "Launching..." : inputMode === "batch" ? "Run Batch Docking" : "Run Docking"}
        </button>
      </div>
    </section>
  );
}
