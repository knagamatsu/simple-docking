import React, { useContext, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RunContext } from "../App.jsx";

export default function Stepper() {
  const { ligandId, selectedProteins, runId } = useContext(RunContext);
  const location = useLocation();
  const navigate = useNavigate();

  const activeStep = useMemo(() => {
    if (location.pathname.startsWith("/results")) return "Results";
    if (location.pathname.startsWith("/settings")) return "Settings";
    if (location.pathname.startsWith("/targets")) return "Targets";
    return "Input";
  }, [location.pathname]);

  const steps = [
    { label: "Input", done: Boolean(ligandId), path: "/" },
    { label: "Targets", done: selectedProteins.length > 0, path: "/targets" },
    { label: "Settings", done: Boolean(runId), path: "/settings" },
    { label: "Results", done: false, path: runId ? `/results/${runId}` : "/results" }
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
