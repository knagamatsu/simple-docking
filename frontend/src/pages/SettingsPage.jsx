import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { createRun } from "../api.js";

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
  const { ligandId, selectedProteins, preset, setPreset, setRunId } = useContext(RunContext);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!ligandId || selectedProteins.length === 0) {
      setError("Please set a ligand and select targets first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await createRun({
        ligand_id: ligandId,
        protein_ids: selectedProteins,
        preset
      });
      setRunId(response.run_id);
      navigate(`/results/${response.run_id}`);
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
          {loading ? "Launching..." : "Run Docking"}
        </button>
      </div>
    </section>
  );
}
