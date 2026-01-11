import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { fetchProteins, importProteinFromPdb, pasteProtein } from "../api.js";

export default function TargetsPage() {
  const navigate = useNavigate();
  const { selectedProteins, setSelectedProteins } = useContext(RunContext);
  const [proteins, setProteins] = useState([]);
  const [activePreset, setActivePreset] = useState("recommended");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [pdbId, setPdbId] = useState("");
  const [pdbName, setPdbName] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    fetchProteins({}).then((data) => {
      setProteins(data);
      // Auto-select recommended targets on initial load for beginners
      if (data.length > 0) {
        const recommendedIds = ["prot_cdk2", "prot_egfr", "prot_pka"];
        const validIds = recommendedIds.filter((id) => data.some((p) => p.id === id));
        setSelectedProteins(validIds.length > 0 ? validIds : data.slice(0, 3).map((p) => p.id));
      }
    }).catch((err) => setError(err.message));
  }, []);

  const presets = useMemo(() => {
    const proteinById = new Map(proteins.map((protein) => [protein.id, protein]));
    const resolveIds = (preset) => {
      if (preset.ids) {
        return preset.ids.filter((id) => proteinById.has(id));
      }
      if (preset.filter) {
        return proteins.filter(preset.filter).map((protein) => protein.id);
      }
      return [];
    };
    const presetDefs = [
      {
        id: "recommended",
        label: "Recommended",
        hint: "Best for initial screening (3 targets)",
        category: "",
        ids: ["prot_cdk2", "prot_egfr", "prot_pka"]
      },
      {
        id: "kinase",
        label: "Kinase panel",
        hint: "Common kinase targets",
        category: "Kinase",
        filter: (protein) => protein.category === "Kinase"
      },
      {
        id: "gpcr",
        label: "GPCR panel",
        hint: "GPCR targets",
        category: "GPCR",
        filter: (protein) => protein.category === "GPCR"
      },
      {
        id: "protease",
        label: "Protease panel",
        hint: "Protease targets",
        category: "Protease",
        filter: (protein) => protein.category === "Protease"
      },
      {
        id: "nuclear",
        label: "Nuclear receptor panel",
        hint: "Nuclear receptor targets",
        category: "Nuclear receptor",
        filter: (protein) => protein.category === "Nuclear receptor"
      },
      {
        id: "all",
        label: "All targets",
        hint: "Full library (may take longer)",
        category: "",
        filter: () => true
      },
      {
        id: "oncology",
        label: "Oncology core",
        hint: "EGFR / ABL / Src / CDK2",
        category: "",
        ids: ["prot_egfr", "prot_abl", "prot_src", "prot_cdk2"]
      },
      {
        id: "signaling",
        label: "Signal transduction",
        hint: "EGFR / Src / PKA",
        category: "",
        ids: ["prot_egfr", "prot_src", "prot_pka"]
      },
      {
        id: "custom",
        label: "Custom",
        hint: "Imported / pasted",
        category: "Custom",
        filter: (protein) => protein.category === "Custom"
      }
    ];
    return presetDefs.map((preset) => ({
      ...preset,
      ids: resolveIds(preset)
    }));
  }, [proteins]);

  const categories = useMemo(() => {
    const set = new Set(proteins.map((protein) => protein.category).filter(Boolean));
    return ["", ...Array.from(set)];
  }, [proteins]);

  const filtered = proteins.filter((protein) => {
    if (category && protein.category !== category) return false;
    if (query && !protein.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const toggleProtein = (id) => {
    setActivePreset("");
    if (selectedProteins.includes(id)) {
      setSelectedProteins(selectedProteins.filter((item) => item !== id));
    } else {
      setSelectedProteins([...selectedProteins, id]);
    }
  };

  const applyPreset = (presetId) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setSelectedProteins(preset.ids);
    setCategory(preset.category || "");
  };

  const applyNewProtein = (protein) => {
    setProteins((prev) => {
      if (prev.some((item) => item.id === protein.id)) return prev;
      return [protein, ...prev];
    });
    setSelectedProteins((prev) => {
      if (prev.includes(protein.id)) return prev;
      return [...prev, protein.id];
    });
  };

  const handleImport = async () => {
    if (!pdbId.trim()) {
      setActionError("PDB ID is required.");
      return;
    }
    setImporting(true);
    setActionError("");
    setActionMessage("");
    try {
      const protein = await importProteinFromPdb({
        pdb_id: pdbId.trim(),
        name: pdbName.trim() || undefined
      });
      applyNewProtein(protein);
      setActionMessage(`Imported ${protein.name}.`);
      setPdbId("");
      setPdbName("");
    } catch (err) {
      setActionError(err.message || "Failed to import from PDB.");
    } finally {
      setImporting(false);
    }
  };

  const handlePaste = async () => {
    if (!pasteText.trim()) {
      setActionError("Paste a PDB file before adding.");
      return;
    }
    setPasting(true);
    setActionError("");
    setActionMessage("");
    try {
      const protein = await pasteProtein({
        name: pasteName.trim() || undefined,
        pdb_text: pasteText
      });
      applyNewProtein(protein);
      setActionMessage(`Added ${protein.name}.`);
      setPasteName("");
      setPasteText("");
    } catch (err) {
      setActionError(err.message || "Failed to add PDB.");
    } finally {
      setPasting(false);
    }
  };

  // Split presets into main (for beginners) and advanced
  const mainPresets = presets.filter((p) => ["recommended", "kinase", "gpcr", "protease", "nuclear"].includes(p.id));
  const advancedPresets = presets.filter((p) => ["all", "oncology", "signaling", "custom"].includes(p.id));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>2. Target Library</h2>
          <p>"Recommended" is best for quick evaluation. Expand for more options.</p>
        </div>
        <div className="hint">Selected: {selectedProteins.length} targets</div>
      </div>

      {/* Main presets - visible by default */}
      <div className="preset-switch" style={{ marginTop: "16px" }}>
        {mainPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={activePreset === preset.id ? "preset-toggle active" : "preset-toggle"}
            onClick={() => applyPreset(preset.id)}
            title={preset.hint}
          >
            <span>{preset.label}</span>
            <span className="badge">{preset.ids.length}</span>
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {actionError && <div className="error">{actionError}</div>}
      {actionMessage && <div className="success">{actionMessage}</div>}

      {/* Compact scrollable target grid */}
      <div className="target-grid-compact">
        {filtered.map((protein) => (
          <button
            key={protein.id}
            type="button"
            className={selectedProteins.includes(protein.id) ? "card active" : "card"}
            onClick={() => toggleProtein(protein.id)}
          >
            <div>
              <h3>{protein.name}</h3>
              <p className="muted">{protein.category || "Uncategorized"}</p>
            </div>
            <span className="pill">{protein.organism || "N/A"}</span>
          </button>
        ))}
      </div>

      {/* Advanced Options - collapsed by default */}
      <div className="advanced">
        <button type="button" className="ghost" onClick={() => setAdvancedOpen(!advancedOpen)}>
          {advancedOpen ? "Hide" : "Show"} Advanced Options
        </button>
        {advancedOpen && (
          <div className="advanced-body">
            {/* Advanced presets */}
            <div style={{ marginBottom: "16px" }}>
              <p className="muted" style={{ marginBottom: "8px" }}>Additional presets:</p>
              <div className="preset-switch">
                {advancedPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={activePreset === preset.id ? "preset-toggle active" : "preset-toggle"}
                    onClick={() => applyPreset(preset.id)}
                    title={preset.hint}
                  >
                    <span>{preset.label}</span>
                    <span className="badge">{preset.ids.length}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Category filter and search */}
            <div className="filters" style={{ marginBottom: "16px" }}>
              <div className="chips">
                {categories.map((item) => (
                  <button
                    key={item || "all"}
                    type="button"
                    className={category === item ? "chip active" : "chip"}
                    onClick={() => setCategory(item)}
                  >
                    {item || "All"}
                  </button>
                ))}
              </div>
              <input
                className="search"
                placeholder="Search targets"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {/* PDB Import/Paste */}
            <div className="input-grid">
              <div className="input-card">
                <h3>Import from PDB</h3>
                <p className="muted">Fetch a receptor directly from RCSB by ID.</p>
                <label>
                  PDB ID
                  <input
                    value={pdbId}
                    onChange={(event) => setPdbId(event.target.value)}
                    placeholder="e.g. 1M17"
                  />
                </label>
                <label>
                  Name (optional)
                  <input
                    value={pdbName}
                    onChange={(event) => setPdbName(event.target.value)}
                    placeholder="Custom label"
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="button-secondary" onClick={handleImport} disabled={importing}>
                    {importing ? "Importing..." : "Import PDB"}
                  </button>
                  <span className="muted">Stored as a Custom target.</span>
                </div>
              </div>

              <div className="input-card">
                <h3>Paste PDB</h3>
                <p className="muted">Paste a full PDB file to add it to the library.</p>
                <label>
                  Name (optional)
                  <input
                    value={pasteName}
                    onChange={(event) => setPasteName(event.target.value)}
                    placeholder="Custom label"
                  />
                </label>
                <label>
                  PDB content
                  <textarea
                    className="pdb-textarea"
                    rows={6}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="Paste ATOM records here"
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="button-secondary" onClick={handlePaste} disabled={pasting}>
                    {pasting ? "Adding..." : "Add PDB"}
                  </button>
                  <span className="muted">Supports multi-chain receptors.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="actions">
        <span className="muted">Selected: {selectedProteins.length}</span>
        <button
          className="primary"
          type="button"
          onClick={() => navigate("/settings")}
          disabled={selectedProteins.length === 0}
        >
          Next: Settings
        </button>
      </div>
    </section>
  );
}
