import React, { useContext, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";

export default function Stepper() {
  const { ligandId, selectedProteins, runId, inputMode, batchInput, batchId } = useContext(RunContext);
  const location = useLocation();
  const navigate = useNavigate();

  const activeStep = useMemo(() => {
    if (location.pathname.startsWith("/results")) return "Results";
    if (location.pathname.startsWith("/settings")) return "Settings";
    if (location.pathname.startsWith("/targets")) return "Targets";
    return "Input";
  }, [location.pathname]);

  const hasInput = inputMode === "batch" ? Boolean(batchInput?.text?.trim()) : Boolean(ligandId);
  const hasResults = inputMode === "batch" ? Boolean(batchId) : Boolean(runId);
  const resultsPath =
    inputMode === "batch"
      ? batchId
        ? `/batch/${batchId}`
        : "/batch"
      : runId
      ? `/results/${runId}`
      : "/results";

  const steps = [
    { label: "Input", done: hasInput, path: "/" },
    { label: "Targets", done: selectedProteins.length > 0, path: "/targets" },
    { label: "Settings", done: hasResults, path: "/settings" },
    { label: "Results", done: false, path: resultsPath }
  ];

  const handleStepClick = (step, index) => {
    // Allow navigation to completed steps or the next step
    const currentIndex = steps.findIndex((s) => s.label === activeStep);
    if (index <= currentIndex || step.done) {
      navigate(step.path);
    }
  };

  return (
    <div className="stepper">
      {steps.map((step, index) => {
        const currentIndex = steps.findIndex((s) => s.label === activeStep);
        const isClickable = index <= currentIndex || step.done;

        return (
          <div
            key={step.label}
            className={`step ${step.done ? "done" : ""} ${
              step.label === activeStep ? "active" : ""
            } ${isClickable ? "clickable" : ""}`}
            onClick={() => handleStepClick(step, index)}
            style={{ cursor: isClickable ? "pointer" : "default" }}
          >
            <span className="step-index">{index + 1}</span>
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
