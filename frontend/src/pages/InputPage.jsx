import React, { useContext, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import { RunContext } from "../App.jsx";
import { createLigand } from "../api.js";
import "ketcher-react/dist/index.css";

const structServiceProvider = new StandaloneStructServiceProvider();

export default function InputPage() {
  const navigate = useNavigate();
  const {
    setLigandId,
    setRunId,
    inputMode,
    setInputMode,
    batchInput,
    setBatchInput,
    setBatchId
  } = useContext(RunContext);
  const ketcherInstanceRef = useRef(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("smiles");
  const [smiles, setSmiles] = useState("CCO");
  const [molfile, setMolfile] = useState("");
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchName, setBatchName] = useState(batchInput?.name || "");
  const [batchFormat, setBatchFormat] = useState(batchInput?.format || "csv");
  const [batchText, setBatchText] = useState(batchInput?.text || "");
  const [batchError, setBatchError] = useState("");

  const handleKetcherInit = (ketcher) => {
    ketcherInstanceRef.current = ketcher;
  };

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

  const handleBatchFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setBatchText(text);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "sdf") setBatchFormat("sdf");
    if (ext === "csv") setBatchFormat("csv");
  };

  const estimatedCount = useMemo(() => {
    if (!batchText.trim()) return 0;
    if (batchFormat === "csv") {
      const lines = batchText.split(/\r?\n/).filter((line) => line.trim());
      return Math.max(0, lines.length - 1);
    }
    if (batchFormat === "sdf") {
      return batchText.split(/\$\$\$\$/).filter((block) => block.trim()).length;
    }
    return 0;
  }, [batchText, batchFormat]);

  const handleBatchNext = () => {
    if (!batchText.trim()) {
      setBatchError("Paste or upload CSV/SDF content first.");
      return;
    }
    setBatchError("");
    setBatchInput({ name: batchName.trim(), format: batchFormat, text: batchText });
    setRunId(null);
    setBatchId(null);
    navigate("/targets");
  };

  const switchMode = (nextMode) => {
    if (nextMode === inputMode) return;
    setInputMode(nextMode);
    setError("");
    setEditorError("");
    setBatchError("");
  };

  const handleUseEditor = async () => {
    setEditorError("");
    if (!ketcherInstanceRef.current) {
      setEditorError("Editor is not ready yet.");
      return;
    }
    try {
      const smilesText = await ketcherInstanceRef.current.getSmiles();
      if (!smilesText || !smilesText.trim()) {
        setEditorError("Draw a structure first.");
        return;
      }
      setMode("smiles");
      setSmiles(smilesText);
      setMolfile("");
    } catch (err) {
      setEditorError(err.message || "Failed to read from editor.");
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>1. Structure Input</h2>
          <p>Sketch a single compound or upload a batch list.</p>
        </div>
        <div className="mode-toggle segmented">
          <button
            type="button"
            className={inputMode === "single" ? "active" : ""}
            onClick={() => switchMode("single")}
          >
            Single
          </button>
          <button
            type="button"
            className={inputMode === "batch" ? "active" : ""}
            onClick={() => switchMode("batch")}
          >
            Batch
          </button>
        </div>
      </div>

      {inputMode === "single" ? (
        <div className="input-grid">
          <div className="editor-card">
            <div className="editor-header">
              <span>2D Editor</span>
              <span className="badge">Ketcher</span>
            </div>
            <div className="editor-body">
              <div className="ketcher-host">
                <Editor onInit={handleKetcherInit} structServiceProvider={structServiceProvider} />
              </div>
              <div className="editor-actions">
                <button type="button" className="button-secondary" onClick={handleUseEditor}>
                  Use Editor Structure
                </button>
                <span className="muted">Loads the drawing into the input form.</span>
              </div>
              {editorError && <div className="error">{editorError}</div>}
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
      ) : (
        <div className="input-grid">
          <div className="input-card">
            <h3>Batch details</h3>
            <p className="muted">Upload a CSV (name,smiles) or an SDF with multiple blocks.</p>
            <label>
              Batch name
              <input value={batchName} onChange={(event) => setBatchName(event.target.value)} />
            </label>
            <div className="segmented">
              <button
                type="button"
                className={batchFormat === "csv" ? "active" : ""}
                onClick={() => setBatchFormat("csv")}
              >
                CSV
              </button>
              <button
                type="button"
                className={batchFormat === "sdf" ? "active" : ""}
                onClick={() => setBatchFormat("sdf")}
              >
                SDF
              </button>
            </div>
            <div className="file-row">
              <input type="file" accept=".csv,.sdf" onChange={handleBatchFile} />
              <span className="muted">Paste or upload a batch file.</span>
            </div>
            {estimatedCount > 0 && (
              <div className="pill">Detected {estimatedCount} entries</div>
            )}
          </div>

          <div className="input-card">
            <label>
              Batch content
              <textarea
                value={batchText}
                onChange={(event) => setBatchText(event.target.value)}
                rows={10}
                placeholder={
                  batchFormat === "csv"
                    ? "name,smiles\nLigand A,CCO\nLigand B,CN"
                    : "Paste SDF blocks separated by $$$$"
                }
              />
            </label>
            {batchError && <div className="error">{batchError}</div>}
            <button className="primary" type="button" onClick={handleBatchNext}>
              Next: Choose Targets
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
