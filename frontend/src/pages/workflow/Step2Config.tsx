import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { api, formApi } from "../../api/client";
import {
  AlertTriangle,
  Loader,
  Wand2,
} from "lucide-react";

const ANALYSIS_STAGES = [
  "Scanning dataset for representation gaps",
  "Detecting proxy feature correlations",
  "Training model and computing fairness metrics",
  "Calculating SHAP values for explanations",
  "Running counterfactual fairness tests",
  "Probing model under stress perturbations",
  "Generating fix recommendations",
];

function AnalysisLoadingScreen({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="analysis-screen">
        <div className="analysis-card">
          <AlertTriangle
            size={40}
            color="var(--warning)"
            style={{ marginBottom: 16 }}
          />
          <h2 style={{ color: "var(--red)", marginBottom: 12 }}>
            Analysis Failed
          </h2>
          <p className="helper" style={{ marginBottom: 24 }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={onRetry}>
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-screen">
      <div className="analysis-card">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="analysis-spinner-ring">
            <Loader
              size={22}
              color="var(--text-primary)"
              style={{ animation: "spin 1.2s linear infinite" }}
            />
          </div>
          <h2
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: "1.4rem",
              color: "var(--text-primary)",
            }}
          >
            Running Full Analysis
          </h2>
          <p className="helper" style={{ margin: 0 }}>
            Computing all fairness stages. This can take up to a minute for
            larger files.
          </p>
        </div>

        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              fontSize: "0.82rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>Status</span>
            <span>Running</span>
          </div>
          <div className="analysis-progress-track">
            <div className="analysis-progress-indeterminate" />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ANALYSIS_STAGES.map((stage, i) => {
            const active = i === 0;
            return (
              <div
                key={stage}
                className={`analysis-stage ${active ? "is-active" : ""}`}
              >
                {active ? (
                  <Loader
                    size={16}
                    color="var(--accent)"
                    className="analysis-stage-icon analysis-stage-icon-spinning"
                  />
                ) : (
                  <Loader
                    size={16}
                    color="var(--text-secondary)"
                    className="analysis-stage-icon"
                  />
                )}
                <span
                  className={`analysis-stage-label ${active ? "is-active" : ""}`}
                >
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Step2Config() {
  const {
    file,
    sensitiveCols,
    setSensitiveCols,
    targetCol,
    setTargetCol,
    domain,
    setDomain,
    projectId,
    modelType,
    setModelType,
    customModelFile,
    setCustomModelFile,
    metricPriority,
    setMetricPriority,
    isAnalyzing,
    analyzeError,
    runFullAnalysis,
    advanceStep,
    pipelineResults,
  } = useAppContext();

  const [headers, setHeaders] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [analyzingCols, setAnalyzingCols] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { column: string; confidence: number; reason: string }[]
  >([]);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!file) return;
    file.text().then((text) => {
      const lines = text.trim().split(/\r?\n/);
      const parsedHeaders = lines[0]?.split(",") ?? [];
      setHeaders(parsedHeaders);
      if (!targetCol && parsedHeaders.length > 0) {
        setTargetCol(parsedHeaders[parsedHeaders.length - 1]);
      }
    });
  }, [file, targetCol, setTargetCol]);

  // Force modelType to "file" since API source is not yet supported by the backend pipeline.
  useEffect(() => {
    if (modelType === "api") setModelType("file");
  }, [modelType, setModelType]);

  useEffect(() => {
    if (headers.length < 2 || sensitiveCols.length > 0) return;
    let cancelled = false;
    setAnalyzingCols(true);
    runColumnAnalysis(headers, file!)
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result);
        const high = result
          .filter((r) => r.confidence >= 0.5)
          .filter((r) => r.column !== targetCol)
          .map((r) => r.column);
        if (high.length > 0) setSensitiveCols(high);
      })
      .catch(() => {
        if (!cancelled) {
          const guessed = guessSensitiveColumns(headers).filter(
            (c) => c !== targetCol,
          );
          if (guessed.length > 0) setSensitiveCols(guessed);
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyzingCols(false);
      });
    return () => { cancelled = true; };
  }, [headers, file, sensitiveCols.length, setSensitiveCols]);

  const handleStartAnalysis = async () => {
    setLocalError(null);
    if (!file) {
      setLocalError("Please upload a CSV file first.");
      return;
    }
    if (!projectId) {
      setLocalError(
        "Please select or create a project from the top menu first.",
      );
      return;
    }

    try {
      // Persist config — catch 404 gracefully
      try {
        const fd = new FormData();
        fd.append("sensitive_cols", sensitiveCols.join(","));
        fd.append("target_col", targetCol);
        await formApi.patch(`/project/${projectId}/config`, fd);
      } catch (configErr) {
        console.warn("Could not persist config, continuing anyway:", configErr);
      }

      await runFullAnalysis();
      await advanceStep(9);
      navigate("/workflow/step-3");
    } catch (err) {
      const e = err as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      const msg =
        analyzeError ??
        e.response?.data?.detail ??
        e.message ??
        "Analysis failed. Please check the backend is running.";
      setLocalError(msg);
    }
  };

  // Show full-page loading/error overlay while analysis is running
  if (isAnalyzing || (analyzeError && !localError)) {
    return (
      <AnalysisLoadingScreen
        error={analyzeError}
        onRetry={handleStartAnalysis}
      />
    );
  }

  // Show error state after a failed attempt
  if (localError) {
    return (
      <AnalysisLoadingScreen error={localError} onRetry={handleStartAnalysis} />
    );
  }

  if (!file && !pipelineResults) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 2 of 9</div>
            <h1 className="page-title">Configuration</h1>
            <p className="page-subtitle">
              No dataset uploaded for this project. Upload a CSV in Step 1 first.
            </p>
          </div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/workflow/step-1")}
          >
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 2 of 9</div>
          <h1 className="page-title">Configuration</h1>
          <p className="page-subtitle">
            Select the sensitive attributes and define how the model should be
            accessed.
          </p>
        </div>
      </div>

      {headers.length > 0 && (
        <button
          className="btn btn-small"
          disabled={analyzingCols}
          onClick={async () => {
            setAnalyzingCols(true);
            try {
              const result = await runColumnAnalysis(headers, file!);
              setSuggestions(result);
              const newCols = result
                .filter((r) => r.confidence >= 0.5)
                .filter((r) => r.column !== targetCol)
                .map((r) => r.column)
                .filter((c) => !sensitiveCols.includes(c));
              if (newCols.length > 0) {
                setSensitiveCols([...sensitiveCols, ...newCols]);
              } else {
                showToast(
                  "No additional sensitive attributes detected above threshold. You can add more manually below.",
                  "info",
                );
              }
            } catch {
              showToast("Column analysis failed. Falling back to name-based detection.", "error");
              const guessed = guessSensitiveColumns(headers).filter(
                (c) => c !== targetCol && !sensitiveCols.includes(c),
              );
              if (guessed.length > 0) setSensitiveCols([...sensitiveCols, ...guessed]);
            } finally {
              setAnalyzingCols(false);
            }
          }}
          style={{ marginBottom: 12 }}
        >
          <Wand2 size={13} /> {analyzingCols ? "Analyzing..." : "Auto-suggest sensitive attributes"}
        </button>
      )}

      <div className="grid-2">
        <div
          className="card"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <div className="section-title">Sensitive columns</div>
          <p className="helper" style={{ marginBottom: 16 }}>
            Select attributes to audit for bias. We support{" "}
            <strong>Multiple Selection</strong> because bias often overlaps
            across groups.
          </p>

          {/* Selected Chips */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {sensitiveCols.map((col) => {
              const s = suggestions.find((s) => s.column === col);
              return (
                <div
                  key={col}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(200, 157, 124,0.15)",
                    color: "var(--accent)",
                    padding: "4px 10px",
                    borderRadius: "16px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    border: "1px solid rgba(200, 157, 124,0.3)",
                  }}
                >
                  <ConfidenceDot confidence={s?.confidence ?? 0} />
                  {col}
                  <button
                    onClick={() =>
                      setSensitiveCols(sensitiveCols.filter((c) => c !== col))
                    }
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent)",
                      cursor: "pointer",
                      fontSize: "1rem",
                      padding: 0,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
            {sensitiveCols.length === 0 && (
              <span className="helper">No attributes selected</span>
            )}
          </div>

          {/* Dropdown Selector */}
          <select
            className="select"
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val && !sensitiveCols.includes(val)) {
                setSensitiveCols([...sensitiveCols, val]);
              }
            }}
          >
            <option value="" disabled>
              + Add sensitive attribute...
            </option>
            {headers
              .filter((h) => !sensitiveCols.includes(h))
              .map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
          </select>
        </div>

        <div className="card">
          <div className="section-title">Target column</div>
          <p className="helper" style={{ marginBottom: 8 }}>
            The column the model predicts (e.g. 'Approved', 'Risk').
          </p>
          <select
            className="select"
            value={targetCol}
            onChange={(event) => setTargetCol(event.target.value)}
          >
            {headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>

          <div style={{ height: 24 }} />

          <div className="section-title">Project Domain</div>
          <p className="helper" style={{ marginBottom: 8 }}>
            Context-specific benchmarks for the audit.
          </p>
          <select
            className="select"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          >
            {[
              { id: "loan", name: "Financial Services / Loans" },
              { id: "hiring", name: "Human Resources / Recruitment" },
              { id: "insurance", name: "Insurance & Actuarial" },
              { id: "healthcare", name: "Healthcare & Diagnostics" },
              { id: "education", name: "Education & Admissions" },
              { id: "criminal_justice", name: "Public Safety / Law" },
              { id: "marketing", name: "Marketing & Personalization" },
              { id: "other", name: "General / Custom Domain" },
            ].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div style={{ height: 24 }} />

          <div className="section-title">Fairness Priority</div>
          <p className="helper" style={{ marginBottom: 12 }}>
            Choose the metric the forensic engine should prioritize.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              {
                id: "balanced",
                name: "Balanced Audit",
                desc: "Standard audit balancing fairness and model performance.",
              },
              {
                id: "equal_opportunity_first",
                name: "Equal Opportunity",
                desc: "Ensures similar True Positive Rates across all groups.",
              },
              {
                id: "demographic_parity_first",
                name: "Demographic Parity",
                desc: "Ensures the same overall positive outcome rate for all.",
              },
            ].map((p) => (
              <label
                key={p.id}
                className={`priority-card ${metricPriority === p.id ? "active" : ""}`}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  background:
                    metricPriority === p.id
                      ? "rgba(200, 157, 124,0.08)"
                      : "transparent",
                  borderColor:
                    metricPriority === p.id ? "var(--accent)" : "var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="radio"
                    name="priority"
                    checked={metricPriority === p.id}
                    onChange={() => setMetricPriority(p.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        color:
                          metricPriority === p.id
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      {p.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {p.desc}
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">Model source</div>
        <div className="helper">
          Choose whether to use the built-in model pipeline or an external API
          endpoint.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              value="file"
              checked={modelType === "file"}
              onChange={(e) => setModelType(e.target.value as "file" | "api")}
            />
            Built-in / File Upload
          </label>
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.4, cursor: "not-allowed" }}
            title="API model source is not yet supported by the backend pipeline"
          >
            <input
              type="radio"
              value="api"
              checked={false}
              disabled
              onChange={() => {}}
            />
            API Endpoint (coming soon)
          </label>
        </div>
      </div>

      {/* NOTE: API model integration is not yet supported by the unified pipeline.
          The UI (API config card) was removed until backend support is added.
          Tracked in: pipeline.py — custom_model_file handling */}

      {modelType === "file" && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">Model upload (Optional)</div>
          <div className="helper">
            Upload a .pkl or .joblib file. If skipped, we will train a default
            RF model automatically.
          </div>
          <input
            id="model-upload"
            className="input"
            type="file"
            accept=".pkl,.joblib"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setCustomModelFile(f);
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
            }}
          >
            <label
              htmlFor="model-upload"
              className="btn btn-secondary"
              style={{ cursor: "pointer", margin: 0 }}
            >
              Browse Files
            </label>
            {customModelFile && (
              <span style={{ fontSize: "0.85rem", color: "var(--accent)" }}>
                {customModelFile.name}
              </span>
            )}
          </div>
        </div>
      )}


    </div>
  );
}

async function runColumnAnalysis(
  columns: string[],
  file: File,
): Promise<{ column: string; confidence: number; reason: string }[]> {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  const sample = lines.slice(1, 501).map((l) => l.split(","));
  const res = await api.post("/project/analyze-columns", {
    columns,
    rows: sample,
  });
  return res.data;
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8
      ? "var(--accent)"
      : confidence >= 0.5
        ? "#c89d7c"
        : confidence > 0
          ? "var(--text-muted)"
          : "transparent";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

const TECHNICAL_HINTS = [
  "id", "uuid", "guid", "key",
  "timestamp", "createdat", "updatedat",
  "index", "rank",
  "amount", "total", "price", "cost",
];

function guessSensitiveColumns(headers: string[]): string[] {
  return headers.filter((h) => {
    const lc = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    return !TECHNICAL_HINTS.some((hint) => lc.includes(hint));
  });
}
