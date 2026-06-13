import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SandboxComparison from "../../components/SandboxComparison";
import { useAppContext } from "../../context/AppContext";
import type { FixRecommendation } from "../../types";

import EmptyState from "../../components/EmptyState";

export default function Step8Sandbox() {
  const {
    file,
    pipelineResults,
    recommendResult,
    runSandboxSimulation,
    sandboxResult,
    advanceStep,
  } = useAppContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recommendResult) return;
    setSelected(recommendResult.map((r: FixRecommendation) => r.fix_id));
  }, [recommendResult]);

  const handleSimulate = async (fixesToRun?: string[]) => {
    setScenarioLoading(true);
    setSimulateError(null);
    try {
      await runSandboxSimulation(fixesToRun || selected);
    } catch (e) {
      const err = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      const message =
        err.response?.data?.detail || err.message || "Simulation failed";
      setSimulateError(message);
    } finally {
      setScenarioLoading(false);
    }
  };

  if (!file && !pipelineResults) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 8 of 9</div>
            <h1 className="page-title">Sandbox Fixes</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 8"
          title="No dataset uploaded"
          description="Upload a CSV in Step 1 to unlock the sandbox and test mitigations against your model."
          primaryAction={{ label: "Go to Upload", to: "/workflow/step-1" }}
        />
      </div>
    );
  }

  if (loading || !pipelineResults || !recommendResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 8 of 9</div>
            <h1 className="page-title">Sandbox Fixes</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 8"
          title="Generating fix recommendations..."
          description="Analyzing bias and stress-test results to suggest actionable fixes. This usually takes a few seconds."
        />
      </div>
    );
  }

  const getCategory = (fixType: string) => {
    const t = fixType.toLowerCase();
    if (
      t.includes("data") ||
      t.includes("sample") ||
      t.includes("feature") ||
      t.includes("reweighing")
    )
      return "Data Fixes";
    if (t.includes("threshold") || t.includes("policy") || t.includes("human"))
      return "Policy Fixes";
    return "Model Fixes";
  };

  const dataFixes = recommendResult.filter(
    (r) => getCategory(r.fix_type) === "Data Fixes",
  );
  const modelFixes = recommendResult.filter(
    (r) => getCategory(r.fix_type) === "Model Fixes",
  );
  const policyFixes = recommendResult.filter(
    (r) => getCategory(r.fix_type) === "Policy Fixes",
  );

  const renderFixGroup = (title: string, fixes: FixRecommendation[]) => {
    if (!fixes || fixes.length === 0) return null;
    return (
      <div style={{ marginBottom: 32 }}>
        <h3
          style={{
            borderBottom: "0.5px solid var(--border)",
            paddingBottom: 8,
            marginBottom: 16,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h3>
        <div className="grid-2">
          {fixes.map((fix) => {
            const isApplied = selected.includes(fix.fix_id);
            const rationale =
              fix.mitigation_options?.[0]?.rationale ||
              "Addresses identified bias patterns directly.";

            return (
              <div
                className="card"
                key={fix.fix_id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  border: isApplied
                    ? "0.5px solid rgba(200, 157, 124,0.72)"
                    : "0.5px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {fix.fix_type.replace(/_/g, " ").toUpperCase()}
                  </div>
                  {isApplied && <span className="pill green">Active</span>}
                </div>

                <div style={{ marginBottom: 12, fontSize: "0.95rem" }}>
                  <strong style={{ color: "var(--text-secondary)" }}>
                    What to do:
                  </strong>
                  <div style={{ color: "var(--text-primary)", marginTop: 4 }}>
                    {fix.description}
                  </div>
                </div>

                <div style={{ marginBottom: 12, fontSize: "0.95rem" }}>
                  <strong style={{ color: "var(--text-secondary)" }}>
                    Why it helps:
                  </strong>
                  <div style={{ color: "var(--text-primary)", marginTop: 4 }}>
                    {rationale}
                  </div>
                </div>

                <div
                  style={{ marginBottom: 24, fontSize: "0.95rem", flexGrow: 1 }}
                >
                  <strong style={{ color: "var(--text-secondary)" }}>
                    Expected impact:
                  </strong>
                  <div
                    style={{
                      color: "var(--accent)",
                      marginTop: 4,
                      fontWeight: 500,
                    }}
                  >
                    {fix.estimated_impact}
                  </div>
                </div>

                <button
                  className={`btn ${isApplied ? "btn-secondary" : "btn-primary"}`}
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => {
                    let newSelected;
                    if (isApplied) {
                      newSelected = selected.filter((id) => id !== fix.fix_id);
                    } else {
                      newSelected = [...selected, fix.fix_id];
                    }
                    setSelected(newSelected);
                    handleSimulate(newSelected);
                  }}
                  disabled={scenarioLoading}
                >
                  {scenarioLoading
                    ? "Running..."
                    : isApplied
                      ? "Remove from Sandbox"
                      : "Apply in Sandbox"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 8 of 9</div>
          <h1 className="page-title">Sandbox Fixes</h1>
          <p className="helper" style={{ marginTop: 8 }}>
            Review AI-generated recommendations to mitigate bias. Apply fixes to
            your sandbox environment to simulate their impact.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        {renderFixGroup("Data Fixes", dataFixes)}
        {renderFixGroup("Model Fixes", modelFixes)}
        {renderFixGroup("Policy Fixes", policyFixes)}
        {recommendResult.length === 0 && (
          <span className="helper">
            No fixes recommended based on the current results.
          </span>
        )}
      </div>

      {sandboxResult?.scenarios && (
        <div className="card fade-in" style={{ marginBottom: 24 }}>
          <div className="section-title">Sandbox Comparison Results</div>
          <SandboxComparison scenarios={sandboxResult.scenarios} />
          {sandboxResult.recommendation && (
            <p className="helper" style={{ marginTop: 12 }}>
              {sandboxResult.recommendation}
            </p>
          )}
        </div>
      )}

      {simulateError && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            borderColor: "var(--red)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <p style={{ color: "var(--red)" }}>
            Simulation error: {simulateError}
          </p>
        </div>
      )}


    </div>
  );
}
