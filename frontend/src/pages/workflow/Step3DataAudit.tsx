import { useMemo, useState } from "react";
import AnimatedBarChart from "../../components/animations/AnimatedBarChart";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { ArrowRight } from "lucide-react";
import EmptyState from "../../components/EmptyState";
import HelpButton from "../../components/HelpButton";

export default function Step3DataAudit() {
  const {
    pipelineResults,
    auditResult: audit,
    proxyResult: proxy,
    domain,
    advanceStep,
  } = useAppContext();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const navigate = useNavigate();

  const primarySensitive = useMemo(
    () => Object.keys(audit?.group_stats || {})[0] || "group",
    [audit],
  );

  const fairnessScore = useMemo(() => {
    if (!audit) return 0;
    const maxGap = audit.max_gap;
    const rawScore =
      maxGap != null
        ? Math.round(100 * (1 - maxGap))
        : audit.risk_level === "Red"
          ? 48
          : audit.risk_level === "Yellow"
            ? 70
            : 88;
    return Math.max(0, Math.min(100, rawScore));
  }, [audit]);

  const chartData = useMemo(() => {
    if (!audit?.group_stats) return [];
    const gs = audit.group_stats;
    const firstKey = Object.keys(gs)[0];
    if (!firstKey) return [];
    return Object.entries(gs[firstKey]).map(([group, metrics]) => ({
      label: group,
      value: Math.round((metrics.positive_rate ?? 0) * 100),
    }));
  }, [audit]);

  const quality = audit?.dataset_quality;
  const hasQualityWarnings = quality?.warnings && quality.warnings.length > 0;
  const hasImbalance = (audit?.imbalanced_attributes ?? []).length > 0;

  const underRep = useMemo(
    () =>
      (audit?.under_represented_groups ?? []).filter((group: string) => {
        const value = String(group ?? "")
          .trim()
          .toLowerCase();
        return (
          value !== "" &&
          value !== "nan" &&
          value !== "null" &&
          value !== "none" &&
          value !== "undefined"
        );
      }),
    [audit],
  );

  const proxyFeatures = proxy?.proxy_features ?? [];

  if (!pipelineResults || !audit || !proxy) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="kicker">Step 3 of 9</div>
            <h1 className="page-title">Data Audit</h1>
          </div>
        </div>
        <EmptyState
          compact
          kicker="Step 3"
          title="No analysis data yet"
          description="Run the full audit pipeline to see representation gaps, missing data, and proxy-feature warnings for your dataset."
          primaryAction={{
            label: "Go to Configuration",
            to: "/workflow/step-2",
          }}
          secondaryAction={{ label: "Back", to: "/workflow/step-2" }}
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="kicker">Step 3 of 9</div>
          <h1 className="page-title">Data Audit</h1>
          <p className="page-subtitle">
            We analyzed your dataset for representation bias and missing data
            before modeling.
          </p>
        </div>
      </div>

      <div
        className={`banner ${audit.risk_level.toLowerCase()}`}
        style={{ marginBottom: 16 }}
      >
        <h2 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {audit.risk_level} risk detected
          <HelpButton
            module="data_audit"
            metricName="risk_level"
            metricValue={fairnessScore}
            context={{ domain, _extra: { risk_level: audit.risk_level, risk_reason: audit.risk_reason } }}
          />
        </h2>
        <p className="helper" style={{ color: "inherit" }}>
          {audit.risk_reason}
        </p>
      </div>

      <div className="card section-gap">
        <div className="stat-label">
          Data Fairness Score
          <HelpButton
            module="data_audit"
            metricName="fairness_score"
            metricValue={fairnessScore}
            context={{ domain, _extra: { risk_level: audit.risk_level } }}
          />
        </div>
        <div
          className={`stat-number text-8xl ${fairnessScore < 65 ? "text-red" : "text-accent"}`}
        >
          {fairnessScore}
        </div>
        <p className="helper">
          Representation, missingness, and proxy-feature pressure combined into
          one forensic score.
        </p>
      </div>

      {hasQualityWarnings && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: "var(--warning)",
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
          <div
            className="section-title"
            style={{
              color: "var(--warning)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>⚠ Dataset Quality Warnings</span>
          </div>
          <div className="stack stack-sm" style={{ marginTop: 12 }}>
            {quality?.warnings?.map((w: string, i: number) => (
              <div key={i} className="notice" style={{ fontSize: "0.9rem" }}>
                {w}
              </div>
            ))}
          </div>
          {quality && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginTop: 16,
                padding: 12,
                background: "rgba(255,255,255,0.02)",
                borderRadius: 8,
              }}
            >
              <div>
                <span className="helper">
                  Rows: <strong>{quality.n_rows}</strong>
                </span>
              </div>
              <div>
                <span className="helper">
                  Min class: <strong>{quality.min_class_size}</strong>
                </span>
              </div>
              <div>
                <span className="helper">
                  Min group: <strong>{quality.min_group_size ?? "N/A"}</strong>
                </span>
              </div>
              <div>
                <span className="helper">
                  Sufficient:{" "}
                  <strong>{quality.is_sufficient ? "Yes" : "No"}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {hasImbalance && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Attribute Balance</div>
          <div className="stack stack-sm" style={{ marginTop: 8 }}>
            {(audit.imbalanced_attributes ?? []).map((attr: string) => (
              <div key={attr} className="notice">
                <strong>{attr}</strong>{" "}
                {"has a dominant group (>80%). Consider stratified sampling."}
              </div>
            ))}
            {(audit.balanced_attributes ?? []).length > 0 && (
              <div className="notice">
                <span className="helper">
                  Balanced: {(audit.balanced_attributes ?? []).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">{primarySensitive} group stats</div>
          <div style={{ height: 280, marginTop: 16 }}>
            <AnimatedBarChart
              data={chartData}
              height={250}
              maxDomain={100}
              valueSuffix="%"
            />
          </div>
        </div>
        <div className="card">
          <div className="section-title">Under-represented groups</div>
          <div className="notice-list">
            {underRep
              .filter((group: string) => !dismissed.includes(group))
              .map((group: string) => (
                <div className="notice" key={group}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <strong>{group}</strong>
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        setDismissed((current) => [...current, group])
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            {underRep.length === 0 && (
              <div className="notice">
                <span className="helper">
                  No under-represented groups detected after excluding missing
                  values.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="section-title">Missing data</div>
          <table className="table">
            <thead>
              <tr>
                <th>Column</th>
                <th>% Missing</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(audit.missing_data || {}).map(
                ([column, value]) => (
                  <tr key={column}>
                    <td>{column}</td>
                    <td>{(value * 100).toFixed(1)}%</td>
                    <td>
                      <span
                        className={`pill ${value > 0.1 ? "red" : value > 0.05 ? "yellow" : "green"}`}
                      >
                        {value > 0.1
                          ? "High"
                          : value > 0.05
                            ? "Moderate"
                            : "Low"}
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-title">Proxy risk</div>
          <div className="helper">
            Features that highly correlate with sensitive attributes.
          </div>
          <div className="notice-list" style={{ marginTop: 12 }}>
            {proxyFeatures.map(
              (feature: {
                feature: string;
                proxy_score?: number;
                cluster_proxy_score?: number;
                combined_score?: number;
                correlated_with?: string;
                related_sensitive?: string;
                warning?: string;
              }) => {
                const score =
                  feature.proxy_score ??
                  feature.cluster_proxy_score ??
                  feature.combined_score ??
                  0;
                const correlatedWith =
                  feature.correlated_with ??
                  feature.related_sensitive ??
                  "sensitive attribute";
                return (
                  <div className="notice" key={feature.feature}>
                    <strong>{feature.feature}</strong>
                    <div className="helper">
                      Correlated with {correlatedWith}
                    </div>
                    <div
                      className="progress-track"
                      style={{ margin: "10px 0" }}
                    >
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.max(0, Math.min(1, score)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="helper">{feature.warning}</div>
                  </div>
                );
              },
            )}
            {proxyFeatures.length === 0 && (
              <div className="notice">
                <span className="helper">
                  No high-confidence proxy features were detected for this
                  dataset.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
