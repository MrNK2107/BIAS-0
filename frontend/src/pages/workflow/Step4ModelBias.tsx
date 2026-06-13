import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FairnessTable from "../../components/FairnessTable";
import FairnessMetricsPanel from "../../components/FairnessMetricsPanel";
import HiddenBiasExplorer from "../../components/HiddenBiasExplorer";
import { useAppContext } from "../../context/AppContext";
import { ArrowRight } from "lucide-react";
import EmptyState from "../../components/EmptyState";
import type { ModelSummary } from "../../types";
import HelpButton from "../../components/HelpButton";

export default function Step4ModelBias() {
  const { pipelineResults, biasResult, counterfactualResult, advanceStep } =
    useAppContext();
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  if (!pipelineResults || !biasResult) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 4 of 9</div>
            <h1 className="page-title">Model Bias</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 4"
          title="No model bias results yet"
          description="Run the full audit pipeline to evaluate how the model performs across different demographic groups."
          primaryAction={{
            label: "Go to Configuration",
            to: "/workflow/step-2",
          }}
          secondaryAction={{ label: "Back", to: "/workflow/step-3" }}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}
        >
          <button
            className="btn btn-primary"
            onClick={() => navigate("/workflow/step-2")}
          >
            Go to Configuration <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  const availableGroups = Object.keys(biasResult.group_performance || {});
  const displayGroupKey =
    availableGroups.length > 0 ? availableGroups[0] : null;
  const modelKeys = biasResult?.all_models
    ? Object.keys(biasResult.all_models)
    : [];
  const activeModelKey =
    selectedModel && modelKeys.includes(selectedModel) ? selectedModel : null;

  // Use the selected model's score, or fallback to the main fairness_score
  const activeModel: ModelSummary | undefined = activeModelKey
    ? biasResult?.all_models?.[activeModelKey]
    : undefined;
  const fairnessScore =
    activeModel?.fairness_score ??
    biasResult.fairness_score ??
    Math.max(
      0,
      Math.round(
        100 - (biasResult.metrics?.demographic_parity_difference || 0) * 100,
      ),
    );

  const activePValues = activeModel?.p_values ?? biasResult?.p_values;
  const pValues = activePValues;
  const hasSignificantBias = pValues
    ? (Object.values(pValues) as number[]).some((p) => p < 0.05)
    : false;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 4 of 9</div>
          <h1 className="page-title">Model Bias</h1>
          <p className="page-subtitle">
            We evaluated the model across different groups to check for
            disparate impact.
          </p>
        </div>
      </div>

      <div className="card section-gap">
        <div className="stat-label">
          Fairness Score
          <HelpButton
            module="model_bias"
            metricName="fairness_score"
            metricValue={fairnessScore}
            context={{
              _extra: {
                demographic_parity_difference: biasResult.metrics?.demographic_parity_difference,
                equal_opportunity_difference: biasResult.metrics?.equal_opportunity_difference,
                fairness_score: fairnessScore,
              },
            }}
          />
        </div>
        <div
          className={`stat-number text-8xl ${fairnessScore < 70 ? "text-red" : "text-accent"}`}
        >
          {fairnessScore}
        </div>
        {activePValues && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 16,
            }}
          >
            {Object.entries(activePValues).map(([metric, pval]) => {
              const p = pval as number;
              return (
                <div
                  key={metric}
                  className="pill"
                  style={{
                    background:
                      p < 0.001
                        ? "rgba(162,74,70,0.15)"
                        : p < 0.05
                          ? "rgba(200,157,124,0.15)"
                          : "rgba(143,168,155,0.15)",
                    border: `0.5px solid ${p < 0.001 ? "var(--red)" : p < 0.05 ? "var(--accent)" : "var(--green)"}`,
                    color:
                      p < 0.001
                        ? "var(--red)"
                        : p < 0.05
                          ? "var(--accent)"
                          : "var(--green)",
                    fontSize: "0.72rem",
                  }}
                >
                  {metric.replace(/_/g, " ")}: p={p.toFixed(4)}{" "}
                  {p < 0.05 ? "★" : ""}
                </div>
              );
            })}
            <div className="helper" style={{ fontSize: "0.72rem" }}>
              {hasSignificantBias
                ? "★ Statistical significance detected — gaps unlikely due to random chance"
                : "No statistical significance — gaps may be noise-driven"}
            </div>
          </div>
        )}
      </div>

      {modelKeys.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Model Comparison</div>
          <p className="helper" style={{ marginBottom: 12 }}>
            Multiple models trained on the same data. Each shows a different
            bias profile.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {modelKeys.map((key) => {
              const m = biasResult?.all_models?.[key];
              const isActive =
                (activeModelKey ?? biasResult?.model_used) === key;
              return (
                <button
                  key={key}
                  className={`btn btn-small ${isActive ? "btn-primary" : ""}`}
                  onClick={() => setSelectedModel(key)}
                  style={{ fontSize: "0.8rem" }}
                >
                  {key === "rf"
                    ? "Random Forest"
                    : key === "linear"
                      ? "Logistic Regression"
                      : key === "xgb"
                        ? "XGBoost"
                        : key}
                  {m && !("error" in m) ? ` (${m.fairness_score})` : " (error)"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <FairnessMetricsPanel
        biasResult={biasResult}
        counterfactualResult={counterfactualResult}
      />

      {displayGroupKey && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">
            Group performance ({displayGroupKey})
          </div>
          <FairnessTable data={biasResult.group_performance[displayGroupKey]} />
        </div>
      )}

      {biasResult?.hidden_bias && biasResult.hidden_bias.length > 0 && (
        <HiddenBiasExplorer subgroups={biasResult.hidden_bias} />
      )}


    </div>
  );
}
