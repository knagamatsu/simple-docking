import React, { useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import InputPage from "./pages/InputPage.jsx";
import TargetsPage from "./pages/TargetsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import Stepper from "./components/Stepper.jsx";

export const RunContext = React.createContext(null);

export default function App() {
  const [ligandId, setLigandId] = useState(null);
  const [selectedProteins, setSelectedProteins] = useState([]);
  const [preset, setPreset] = useState("Balanced");
  const [runId, setRunId] = useState(null);
  const location = useLocation();

  const contextValue = useMemo(
    () => ({
      ligandId,
      setLigandId,
      selectedProteins,
      setSelectedProteins,
      preset,
      setPreset,
      runId,
      setRunId
    }),
    [ligandId, selectedProteins, preset, runId]
  );

  return (
    <RunContext.Provider value={contextValue}>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">Preset Target Docking</p>
            <h1>Docking Snapshot</h1>
            <p className="subtitle">Rapid hypothesis scouting for chemists.</p>
          </div>
          <nav className="app-nav">
            <NavLink to="/dashboard">Dashboard</NavLink>
          </nav>
        </header>
        <div className="content">
          {location.pathname !== "/dashboard" && <Stepper />}
          <Routes>
            <Route path="/" element={<InputPage />} />
            <Route path="/targets" element={<TargetsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/results/:runId?" element={<ResultsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </div>
      </div>
    </RunContext.Provider>
  );
}
