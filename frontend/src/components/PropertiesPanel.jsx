import React, { useEffect, useState } from "react";
import { fetchLigandProperties, fetchLigandChembl } from "../api.js";

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(decimals);
}

export default function PropertiesPanel({ ligandId }) {
  const [properties, setProperties] = useState(null);
  const [chembl, setChembl] = useState(null);
  const [propsLoading, setPropsLoading] = useState(false);
  const [chemblLoading, setChemblLoading] = useState(false);
  const [propsError, setPropsError] = useState("");
  const [chemblError, setChemblError] = useState("");
  const [showChembl, setShowChembl] = useState(false);

  useEffect(() => {
    if (!ligandId) {
      setProperties(null);
      setPropsError("");
      return;
    }

    let active = true;
    setPropsLoading(true);
    setPropsError("");

    fetchLigandProperties(ligandId)
      .then((data) => {
        if (active) setProperties(data);
      })
      .catch((err) => {
        if (active) setPropsError(err.message || "Failed to load properties");
      })
      .finally(() => {
        if (active) setPropsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ligandId]);

  const handleLoadChembl = () => {
    if (!ligandId || chembl) return;
    setShowChembl(true);
    setChemblLoading(true);
    setChemblError("");

    fetchLigandChembl(ligandId)
      .then((data) => setChembl(data))
      .catch((err) => setChemblError(err.message || "Failed to search ChEMBL"))
      .finally(() => setChemblLoading(false));
  };

  if (!ligandId) {
    return null;
  }

  return (
    <div className="properties-panel">
      <div className="mini-card">
        <h3>Molecular Properties</h3>
        {propsLoading ? (
          <p className="muted">Loading properties...</p>
        ) : propsError ? (
          <p className="error">{propsError}</p>
        ) : properties ? (
          <>
            <div className="props-grid">
              <div className="prop-item">
                <span className="prop-label">MW</span>
                <span className="prop-value">{formatNumber(properties.molecular_weight, 1)}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">LogP</span>
                <span className="prop-value">{formatNumber(properties.logp)}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">TPSA</span>
                <span className="prop-value">{formatNumber(properties.tpsa, 1)}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">HBD</span>
                <span className="prop-value">{properties.hbd}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">HBA</span>
                <span className="prop-value">{properties.hba}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">RotBonds</span>
                <span className="prop-value">{properties.rotatable_bonds}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Rings</span>
                <span className="prop-value">{properties.rings}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Heavy</span>
                <span className="prop-value">{properties.heavy_atoms}</span>
              </div>
            </div>
            <div className="lipinski-badge">
              {properties.lipinski.passes ? (
                <span className="badge good">Lipinski OK</span>
              ) : (
                <span className="badge warn">
                  Lipinski {properties.lipinski.violations} violation{properties.lipinski.violations > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <details className="lipinski-details">
              <summary className="muted">Lipinski's Rule of Five</summary>
              <ul className="lipinski-list">
                <li className={properties.lipinski.mw_ok ? "ok" : "fail"}>
                  MW {"<="} 500: {properties.lipinski.mw_ok ? "Pass" : "Fail"}
                </li>
                <li className={properties.lipinski.logp_ok ? "ok" : "fail"}>
                  LogP {"<="} 5: {properties.lipinski.logp_ok ? "Pass" : "Fail"}
                </li>
                <li className={properties.lipinski.hbd_ok ? "ok" : "fail"}>
                  HBD {"<="} 5: {properties.lipinski.hbd_ok ? "Pass" : "Fail"}
                </li>
                <li className={properties.lipinski.hba_ok ? "ok" : "fail"}>
                  HBA {"<="} 10: {properties.lipinski.hba_ok ? "Pass" : "Fail"}
                </li>
              </ul>
            </details>
          </>
        ) : (
          <p className="muted">No properties available.</p>
        )}
      </div>

      <div className="mini-card">
        <div className="chembl-header">
          <h3>ChEMBL Similar Compounds</h3>
          {!showChembl && (
            <button
              type="button"
              className="button-secondary"
              onClick={handleLoadChembl}
              disabled={!ligandId}
            >
              Search
            </button>
          )}
        </div>
        {!showChembl ? (
          <p className="muted">Click Search to find similar compounds in ChEMBL.</p>
        ) : chemblLoading ? (
          <p className="muted">Searching ChEMBL...</p>
        ) : chemblError ? (
          <p className="error">{chemblError}</p>
        ) : chembl ? (
          <>
            {chembl.similar_compounds.length === 0 ? (
              <p className="muted">No similar compounds found (threshold: {chembl.threshold}%).</p>
            ) : (
              <div className="chembl-results">
                <p className="muted">
                  Found {chembl.similar_compounds.length} similar compounds (threshold: {chembl.threshold}%)
                </p>
                <div className="chembl-list">
                  {chembl.similar_compounds.map((compound) => (
                    <div key={compound.chembl_id} className="chembl-item">
                      <div className="chembl-item-header">
                        <a
                          href={`https://www.ebi.ac.uk/chembl/compound_report_card/${compound.chembl_id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chembl-id"
                        >
                          {compound.chembl_id}
                        </a>
                        <span className="similarity-badge">{compound.similarity}%</span>
                      </div>
                      {compound.pref_name && (
                        <p className="chembl-name">{compound.pref_name}</p>
                      )}
                      <div className="chembl-meta">
                        {compound.molecule_type && (
                          <span className="chip small">{compound.molecule_type}</span>
                        )}
                        {compound.max_phase !== null && compound.max_phase > 0 && (
                          <span className="chip small phase">
                            Phase {compound.max_phase}
                            {compound.max_phase === 4 && " (Approved)"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {chembl.known_activities.length > 0 && (
                  <details className="activities-details">
                    <summary className="muted">
                      Known Activities ({chembl.known_activities.length})
                    </summary>
                    <div className="activities-list">
                      {chembl.known_activities.map((activity, idx) => (
                        <div key={`${activity.chembl_id}-${idx}`} className="activity-item">
                          <span className="activity-target">
                            {activity.target_name || "Unknown target"}
                          </span>
                          <span className="activity-value">
                            {activity.activity_type}: {formatNumber(activity.activity_value)} {activity.activity_units || ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
