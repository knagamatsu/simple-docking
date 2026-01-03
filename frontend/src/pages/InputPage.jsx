import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { createLigand } from "../api.js";

export default function InputPage() {
  const navigate = useNavigate();
  const { setLigandId } = useContext(RunContext);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("smiles");
  const [smiles, setSmiles] = useState("CCO");
  const [molfile, setMolfile] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setMolfile(text);
    setMode("molfile");
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        name: name || undefined,
        smiles: mode === "smiles" ? smiles : undefined,
        molfile: mode === "molfile" ? molfile : undefined
      };
      const response = await createLigand(payload);
      setLigandId(response.ligand_id);
      navigate("/targets");
    } catch (err) {
      setError(err.message || "Failed to submit ligand");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>1. Structure Input</h2>
          <p>Sketch or paste a structure to start a run.</p>
        </div>
        <div className="hint">Advanced options are hidden by default.</div>
      </div>

      <div className="input-grid">
        <div className="editor-card">
          <div className="editor-header">
            <span>2D Editor</span>
            <span className="badge">placeholder</span>
          </div>
          <div className="editor-body">
            <div className="editor-placeholder">
              <p>Embed Ketcher or ChemDraw here.</p>
              <p className="muted">For MVP, use the text inputs on the right.</p>
            </div>
          </div>
        </div>

        <div className="input-card">
          <label>
            Compound name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="segmented">
            <button
              type="button"
              className={mode === "smiles" ? "active" : ""}
              onClick={() => setMode("smiles")}
            >
              SMILES
            </button>
            <button
              type="button"
              className={mode === "molfile" ? "active" : ""}
              onClick={() => setMode("molfile")}
            >
              Molfile / SDF
            </button>
          </div>

          {mode === "smiles" ? (
            <textarea
              value={smiles}
              onChange={(event) => setSmiles(event.target.value)}
              rows={6}
              placeholder="Paste SMILES"
            />
          ) : (
            <textarea
              value={molfile}
              onChange={(event) => setMolfile(event.target.value)}
              rows={6}
              placeholder="Paste Molfile or SDF block"
            />
          )}

          <div className="file-row">
            <input type="file" accept=".sdf,.mol,.molfile" onChange={handleFile} />
            <span className="muted">Optional file upload</span>
          </div>

          {error && <div className="error">{error}</div>}

          <button className="primary" type="button" onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting..." : "Next: Choose Targets"}
          </button>
        </div>
      </div>
    </section>
  );
}
