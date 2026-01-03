import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";
import { fetchProteins } from "../api.js";

export default function TargetsPage() {
  const navigate = useNavigate();
  const { selectedProteins, setSelectedProteins } = useContext(RunContext);
  const [proteins, setProteins] = useState([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProteins({}).then(setProteins).catch((err) => setError(err.message));
  }, []);

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
    if (selectedProteins.includes(id)) {
      setSelectedProteins(selectedProteins.filter((item) => item !== id));
    } else {
      setSelectedProteins([...selectedProteins, id]);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>2. Target Library</h2>
          <p>Select a preset target set or fine-tune by category.</p>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => setSelectedProteins(proteins.map((protein) => protein.id))}
        >
          Standard set
        </button>
      </div>

      <div className="filters">
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

      {error && <div className="error">{error}</div>}

      <div className="target-grid">
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
