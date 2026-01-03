import React, { useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { RunContext } from "../App.jsx";

export default function Stepper() {
  const { ligandId, selectedProteins, runId } = useContext(RunContext);
  const location = useLocation();

  const activeStep = useMemo(() => {
    if (location.pathname.startsWith("/results")) return "Results";
    if (location.pathname.startsWith("/settings")) return "Settings";
    if (location.pathname.startsWith("/targets")) return "Targets";
    return "Input";
  }, [location.pathname]);

  const steps = [
    { label: "Input", done: Boolean(ligandId) },
    { label: "Targets", done: selectedProteins.length > 0 },
    { label: "Settings", done: Boolean(runId) },
    { label: "Results", done: false }
  ];

  return (
    <div className="stepper">
      {steps.map((step, index) => (
        <div
          key={step.label}
          className={`step ${step.done ? "done" : ""} ${
            step.label === activeStep ? "active" : ""
          }`}
        >
          <span className="step-index">{index + 1}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
