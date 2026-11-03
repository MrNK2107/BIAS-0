import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Building2,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Download,
  ExternalLink,
  BookOpen,
  ChevronDown,
  Lightbulb,
  FileArchive,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { api, formApi } from "../api/client";
import EmptyState from "../components/EmptyState";
import HelpButton from "../components/HelpButton";
import { downloadAuditReport } from "../utils/reportExport";
import { downloadEvidenceBundle } from "../utils/evidencePack";
import EvidenceVerify from "../components/EvidenceVerify";
import {
  describeExcluded,
  formatCheckValue,
  ll144Payload,
  type ImpactRatioTable,
} from "../utils/compliance";

interface ComplianceCheck {
  check: string;
  value: number | string;
  passed: boolean;
  required: number | boolean;
  /** Heuristic shown for context; does not count toward the status. */
  informational?: boolean;
}

interface RegulationResult {
  short_name: string;
  status: string;
  passed_checks: number;
  total_checks: number;
  checks: ComplianceCheck[];
  overall_score: number;
  impact_ratios?: Record<string, ImpactRatioTable>;
}

interface NarrativeSection {
  intro: string;
  status_narrative: string;
  failure_details: string[];
  passed_count: number;
  total_count: number;
}

interface RemediationAction {
  priority: number;
  category: string;
  action: string;
  detail: string;
}

interface ComplianceNarrative {
  executive_summary: string;
  domain_context: string;
  regulation_narratives: Record<string, NarrativeSection>;
  remediation_actions: RemediationAction[];
  failed_regulations: string[];
  failed_metrics: string[];
}

interface ComplianceResult {
  regulations: Record<string, RegulationResult>;
  overall: {
    compliant_count: number;
    partial_count: number;
    non_compliant_count: number;
    overall_score: number;
    overall_status: string;
    risk_adjusted_score: number;
  };
  metadata: {
    domain: string;
    fairness_score: number;
    demographic_parity: number;
    equal_opportunity_gap: number;
  };
  narrative?: ComplianceNarrative;
}

const REGULATION_META: Record<
  string,
  { icon: typeof Globe; color: string; bg: string }
> = {
  eu_ai_act: {
    icon: Globe,
    color: "#C89D7C",
    bg: "rgba(200, 157, 124, 0.08)",
  },
  nyc_law_144: {
    icon: Building2,
    color: "#DFB99B",
    bg: "rgba(223, 185, 155, 0.08)",
  },
  gdpr_article_22: {
    icon: Shield,
    color: "#8FA89B",
    bg: "rgba(143, 168, 155, 0.08)",
  },
};

const STATUS_CONFIG = {
  compliant: {
    color: "#8FA89B",
    bg: "rgba(143, 168, 155, 0.12)",
    icon: CheckCircle2,
    label: "Compliant",
  },
  partial: {
    color: "#C89D7C",
    bg: "rgba(200, 157, 124, 0.12)",
    icon: AlertTriangle,
    label: "Partial",
  },
  non_compliant: {
    // lighter than the brand red so status text passes 4.5:1 on its tint
    color: "#D9837E",
    bg: "rgba(162, 74, 70, 0.12)",
    icon: XCircle,
    label: "Non-Compliant",
  },
};

export default function ComplianceDashboard() {
  const { projectId, projects, pipelineResults, refreshProjects } = useAppContext();
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  // 6 RCNY 5-301(d): the auditor MAY exclude a category under 2% of the data
  // (off by default); the justification is reported with the excluded category.
  const [excludeSmall, setExcludeSmall] = useState(false);
  const [justificationDraft, setJustificationDraft] = useState("");
  const [justification, setJustification] = useState("");
  // 6 RCNY 5-301(b) selection rates, or (c) scoring rates when the AEDT outputs a score.
  // The choice is a project setting (PATCH /project/{id}/settings), so later
  // runs record it in their provenance.
  const savedRateType =
    projects.find((p) => String(p.id) === String(projectId))?.ll144_rate_type ?? "selection";
  const [rateType, setRateTypeState] = useState<"selection" | "scoring">(savedRateType);
  useEffect(() => setRateTypeState(savedRateType), [savedRateType]);
  const [rateTypeError, setRateTypeError] = useState<string | null>(null);
  const setRateType = (value: "selection" | "scoring") => {
    setRateTypeState(value);
    if (!projectId) return;
    const form = new FormData();
    form.append("ll144_rate_type", value);
    formApi
      .patch(`/project/${projectId}/settings`, form)
      .then(() => {
        setRateTypeError(null);
        return refreshProjects();
      })
      .catch(() => setRateTypeError("Could not save the rate type to the project settings."));
  };
  const hasScores = Boolean(pipelineResults?.model_bias?.ll144?.scoring);

  useEffect(() => {
    if (!projectId || !pipelineResults?.scores) return;

    setLoading(true);
    const scores = pipelineResults.scores;
    const metrics = pipelineResults.model_bias?.metrics;
    const domain =
      projects.find((p) => String(p.id) === String(projectId))?.domain ||
      "other";

    const payload = {
      project_id: projectId ?? "",
      fairness_score:
        pipelineResults.fairness_score ?? scores.model_bias_score ?? 0,
      demographic_parity: metrics?.demographic_parity_difference ?? 0,
      equal_opportunity_gap: metrics?.equal_opportunity_difference ?? 0,
      domain,
      has_audit_documentation: true,
      has_independent_audit: false,
      has_human_oversight: true,
      ...ll144Payload(pipelineResults.model_bias, rateType),
      exclude_small_categories: excludeSmall,
      exclusion_justification: excludeSmall && justification ? justification : null,
    };

    api
      .post("/compliance/assess", payload)
      .then((res) => setCompliance(res.data as ComplianceResult))
      .catch(() => {
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, [projectId, pipelineResults, projects, excludeSmall, justification, rateType]);

  if (!projectId) {
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 60 }}>
        <EmptyState
          icon={<Shield size={22} />}
          kicker="Compliance"
          title="Select a project first"
          description="Please select or create a project to assess its regulatory compliance."
          primaryAction={{
            label: "Select Project",
            to: "#open-selector",
          }}
        />
      </div>
    );
  }

  if (!pipelineResults?.scores) {
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", paddingTop: 60 }}>
        <EmptyState
          icon={<Shield size={22} />}
          kicker="Compliance"
          title="Run an audit to see compliance status"
          description="Complete a full fairness audit to see how your model aligns with major regulatory frameworks including the EU AI Act, NYC Local Law 144, and GDPR."
          primaryAction={{
            label: "Start Audit Sequence",
            to: "/workflow/step-1",
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "60px 0",
          textAlign: "center",
        }}
      >
        <Shield
          size={40}
          className="animate-pulse"
          style={{
            color: "var(--accent)",
            margin: "0 auto 20px",
            opacity: 0.5,
          }}
        />
        <p className="helper">Evaluating regulatory compliance...</p>
      </div>
    );
  }

  if (!compliance) return null;

  const { regulations, overall, metadata } = compliance;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      <header
        className="page-header"
        style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 32 }}
      >
        <div>
          <div className="kicker">Regulatory Compliance</div>
          <h1 className="page-title">Regulatory Alignment</h1>
          <p className="page-subtitle">
            Assess how your model aligns with global AI fairness regulations.
            Scores map to regulatory requirements for audit readiness.
          </p>
        </div>
        <div
          className="pill"
          style={{
            background:
              STATUS_CONFIG[
                overall.overall_status as keyof typeof STATUS_CONFIG
              ]?.bg,
            borderColor:
              STATUS_CONFIG[
                overall.overall_status as keyof typeof STATUS_CONFIG
              ]?.color,
            color:
              STATUS_CONFIG[
                overall.overall_status as keyof typeof STATUS_CONFIG
              ]?.color,
            fontSize: "0.75rem",
            padding: "8px 16px",
          }}
        >
          {overall.overall_status === "compliant"
            ? "Fully Compliant"
            : overall.overall_status === "partial"
              ? "Partially Compliant"
              : "Non-Compliant"}
        </div>
      </header>

      {/* Overall Score Ring */}
      <div
        className="card card-primary"
        style={{ marginBottom: 32, textAlign: "center", padding: "40px" }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-block",
            margin: "0 auto",
          }}
        >
          <svg width="160" height="160" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="6"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={
                overall.overall_status === "compliant" ? "#8FA89B" : "#C89D7C"
              }
              strokeWidth="6"
              strokeDasharray="276"
              initial={{ strokeDashoffset: 276 }}
              animate={{ strokeDashoffset: 276 - overall.overall_score * 2.76 }}
              transition={{ duration: 1.8, ease: "circOut" }}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "2.8rem",
                fontWeight: 700,
                color:
                  overall.overall_status === "compliant"
                    ? "#8FA89B"
                    : "#C89D7C",
                lineHeight: 1,
              }}
            >
              {Math.round(overall.overall_score)}
            </div>
            <div
              className="stat-label"
              style={{ fontSize: "0.55rem", marginTop: 4 }}
            >
              Compliance Score
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            marginTop: 28,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{ fontSize: "1.8rem", fontWeight: 700, color: "#8FA89B" }}
            >
              {overall.compliant_count}
            </div>
            <div className="stat-label">Fully Compliant</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{ fontSize: "1.8rem", fontWeight: 700, color: "#C89D7C" }}
            >
              {overall.partial_count}
            </div>
            <div className="stat-label">Partial</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{ fontSize: "1.8rem", fontWeight: 700, color: "#A24A46" }}
            >
              {overall.non_compliant_count}
            </div>
            <div className="stat-label">Non-Compliant</div>
          </div>
        </div>
        <div className="divider-hairline" style={{ margin: "24px 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 40,
            flexWrap: "wrap",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            Domain:{" "}
            <strong
              style={{
                color: "var(--text-primary)",
                textTransform: "capitalize",
              }}
            >
              {metadata.domain}
            </strong>
          </span>
          <span>
            Fairness Score:{" "}
            <strong style={{ color: "var(--accent)" }}>
              {Math.round(metadata.fairness_score)}
            </strong>
          </span>
          <span>
            Demographic Parity:{" "}
            <strong
              style={{
                color:
                  metadata.demographic_parity > 0.2 ? "#A24A46" : "#8FA89B",
              }}
            >
              {(metadata.demographic_parity * 100).toFixed(1)}%
            </strong>
          </span>
        </div>
      </div>

      {/* NYC LL144 auditor option: 6 RCNY 5-301(d) small-category exclusion */}
      <div
        className="card"
        style={{ marginBottom: 24, padding: "14px 18px", fontSize: "0.82rem", display: "grid", gap: 8 }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={excludeSmall}
            onChange={(e) => setExcludeSmall(e.target.checked)}
          />
          NYC LL144: exclude categories under 2% of the data from the impact ratios (auditor's option,
          6 RCNY 5-301(d)). Excluded categories are still reported with their count and rate.
        </label>
        {hasScores && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={rateType === "scoring"}
              onChange={(e) => setRateType(e.target.checked ? "scoring" : "selection")}
            />
            The tool scores candidates: use scoring rates (share above the median score, 6 RCNY
            5-301(c)) instead of selection rates. Saved as a project setting and recorded in the
            provenance of later runs.
          </label>
        )}
        {!hasScores && rateType === "scoring" && (
          <span style={{ color: "var(--text-secondary)" }}>
            The project is set to scoring rates, but this run has no scores (the model has no
            predict_proba), so selection rates are shown.
          </span>
        )}
        {rateTypeError && (
          <span role="alert" style={{ color: "var(--text-secondary)" }}>
            {rateTypeError}
          </span>
        )}
        {excludeSmall && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label="Justification for the exclusion"
              placeholder="Auditor's justification (required in the summary of results)"
              value={justificationDraft}
              maxLength={2000}
              onChange={(e) => setJustificationDraft(e.target.value)}
              style={{ flex: "1 1 280px", minWidth: 0 }}
            />
            <button className="btn btn-small" onClick={() => setJustification(justificationDraft.trim())}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Regulation Cards */}
      <div style={{ display: "grid", gap: 24 }}>
        {Object.entries(regulations).map(([key, reg]) => {
          const meta = REGULATION_META[key] || REGULATION_META.eu_ai_act;
          const Icon = meta.icon;
          const statusCfg =
            STATUS_CONFIG[reg.status as keyof typeof STATUS_CONFIG] ||
            STATUS_CONFIG.non_compliant;
          const StatusIcon = statusCfg.icon;

          return (
            <motion.div
              key={key}
              className="card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ padding: 0, overflow: "hidden" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "320px 1fr",
                  gap: 0,
                  minHeight: 0,
                }}
              >
                {/* Left: Regulation Info */}
                <div
                  style={{
                    padding: "28px",
                    background: meta.bg,
                    borderRight: "1px solid var(--border-faint)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${meta.color}33, transparent)`,
                        border: `1px solid ${meta.color}44`,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon size={20} color={meta.color} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "1.05rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {reg.short_name}
                      </div>
                      <StatusIcon
                        size={13}
                        color={statusCfg.color}
                        style={{ marginTop: 2 }}
                      />
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: statusCfg.color,
                          marginLeft: 4,
                          fontWeight: 600,
                        }}
                      >
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      marginTop: 8,
                      display: "block",
                    }}
                  >
                    {key === "eu_ai_act"
                      ? "High-risk AI systems must meet strict fairness and transparency standards under the EU regulatory framework."
                      : key === "nyc_law_144"
                        ? "NYC law requires independent bias audits for automated employment decision tools used in hiring or promotion."
                        : "EU regulation granting individuals the right to not be subject to solely automated decisions producing legal effects."}
                  </span>

                  <div style={{ marginTop: "auto", paddingTop: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <span className="stat-label">Compliance Score</span>
                      <span style={{ fontWeight: 700, color: statusCfg.color }}>
                        {Math.round(reg.overall_score)}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <motion.div
                        className="progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${reg.overall_score}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                        style={{
                          background: `linear-gradient(90deg, ${meta.color}, ${meta.color}cc)`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Checks */}
                <div style={{ padding: "28px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <span className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      Requirements
                      <HelpButton
                        module="compliance"
                        metricName={`compliance_${key}`}
                        context={{ regulation: reg.short_name }}
                      />
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {reg.passed_checks}/{reg.total_checks} passed
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {reg.checks.map((check, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 14px",
                          background: check.informational
                            ? "transparent"
                            : check.passed
                              ? "rgba(143, 168, 155, 0.06)"
                              : "rgba(162, 74, 70, 0.06)",
                          borderRadius: 8,
                          border: check.informational
                            ? "1px dashed var(--border, rgba(127, 127, 127, 0.3))"
                            : `1px solid ${check.passed ? "rgba(143, 168, 155, 0.15)" : "rgba(162, 74, 70, 0.15)"}`,
                        }}
                      >
                        {check.informational ? (
                          <AlertTriangle
                            size={16}
                            color="var(--text-muted)"
                            style={{ flexShrink: 0 }}
                            aria-label="Informational heuristic, not a legal threshold"
                          />
                        ) : check.passed ? (
                          <CheckCircle2
                            size={16}
                            color="#8FA89B"
                            style={{ flexShrink: 0 }}
                          />
                        ) : (
                          <XCircle
                            size={16}
                            color="#A24A46"
                            style={{ flexShrink: 0 }}
                          />
                        )}
                        <div
                          style={{
                            flex: 1,
                            fontSize: "0.85rem",
                            color: "var(--text-primary)",
                          }}
                        >
                          {check.check}
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: check.informational
                              ? "var(--text-secondary)"
                              : check.passed
                                ? "#8FA89B"
                                : "#A24A46",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatCheckValue(check)}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {reg.impact_ratios &&
                    Object.entries(reg.impact_ratios).map(([attr, table]) => (
                      <div key={attr} style={{ marginTop: 16 }}>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginBottom: 6,
                          }}
                        >
                          Impact ratios — {attr} ({table.rate_type ?? "selection"} rate ÷ rate of{" "}
                          {table.most_selected ??
                            (table.rate_type === "scoring"
                              ? "the highest scoring category"
                              : "the most selected category")}
                          )
                        </div>
                        <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                              <th style={{ padding: "4px 6px", fontWeight: 500 }}>Category</th>
                              <th style={{ padding: "4px 6px", fontWeight: 500 }}>n</th>
                              <th style={{ padding: "4px 6px", fontWeight: 500 }}>
                                {table.rate_type === "scoring" ? "Scoring rate" : "Selection rate"}
                              </th>
                              <th style={{ padding: "4px 6px", fontWeight: 500 }}>Impact ratio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {table.categories.map((row) => (
                              <tr key={row.category} style={{ color: "var(--text-primary)" }}>
                                <td style={{ padding: "4px 6px" }}>{row.category}</td>
                                <td style={{ padding: "4px 6px" }}>{row.n ?? "—"}</td>
                                <td style={{ padding: "4px 6px" }}>
                                  {row.rate === null ? "n/a" : `${(row.rate * 100).toFixed(1)}%`}
                                </td>
                                <td style={{ padding: "4px 6px" }}>
                                  {row.impact_ratio === null ? "n/a" : row.impact_ratio.toFixed(3)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {table.unknown_categories.length > 0 && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                            Unknown category left out of the calculation:{" "}
                            {table.unknown_categories.join(", ")}
                            {table.unknown_count ? ` (${table.unknown_count} individuals)` : ""}
                          </div>
                        )}
                        {(table.excluded_categories?.length ?? 0) > 0 && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 4 }}>
                            Excluded by the auditor (under 2% of the data, 6 RCNY 5-301(d)):{" "}
                            {table.excluded_categories!.map(describeExcluded).join("; ")}.{" "}
                            Justification: {table.exclusion_justification ?? "not given"}
                          </div>
                        )}
                        {table.exclusion_note && (
                          <div style={{ fontSize: "0.72rem", color: "#D9837E", marginTop: 4 }}>
                            {table.exclusion_note}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* LLM-Powered Remediation Narratives */}
      {compliance.narrative && (
        <NarrativeSection
          narrative={compliance.narrative}
          regulations={regulations}
        />
      )}

      {/* Action Footer */}
      <div
        className="card"
        style={{
          marginTop: 24,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FileText size={18} color="var(--accent)" />
          <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Generate a compliance-ready audit report for regulatory submission.
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <button
            className="btn btn-small"
            onClick={() => {
              if (pipelineResults && compliance?.narrative) {
                 
                downloadAuditReport(
                  pipelineResults,
                  "compliance-audit-report",
                   compliance.narrative as unknown as Record<string, unknown>,
                  compliance.regulations?.nyc_law_144?.impact_ratios ?? null,
                );
              }
            }}
          >
            <Download size={14} /> Export Report
          </button>
          <button
            className="btn btn-small"
            disabled={!pipelineResults}
            onClick={() =>
              pipelineResults &&
              downloadEvidenceBundle(
                pipelineResults,
                compliance?.narrative as unknown as Record<string, unknown> | undefined,
                compliance?.regulations?.nyc_law_144?.impact_ratios ?? null,
              )
            }
            title="ZIP: evidence pack JSON, CSV, HTML report and a SHA-256 manifest"
          >
            <FileArchive size={14} /> Evidence Bundle
          </button>
          <button className="btn btn-primary btn-small">
            <ExternalLink size={14} /> View Full Audit Trail
          </button>
        </div>
      </div>
      <EvidenceVerify />
    </div>
  );
}

function NarrativeSection({
  narrative,
  regulations,
}: {
  narrative: ComplianceNarrative;
  regulations: Record<string, RegulationResult>;
}) {
  const [expandedReg, setExpandedReg] = useState<string | null>(null);
  const [showRemediation, setShowRemediation] = useState(true);

  const toggleReg = (key: string) => {
    setExpandedReg((prev) => (prev === key ? null : key));
  };

  return (
    <div style={{ marginTop: 24 }}>
      {/* Executive Summary */}
      <motion.div
        className="card card-primary"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <BookOpen size={20} color="var(--accent)" />
          <span
            className="section-title"
            style={{ margin: 0, fontSize: "0.78rem" }}
          >
            Remediation Intelligence — LLM-Style Narrative
          </span>
        </div>
        <div
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.7,
            color: "var(--text-secondary)",
          }}
          dangerouslySetInnerHTML={{
            __html: narrative.executive_summary.replace(
              /\*\*(.*?)\*\*/g,
              '<strong style="color:var(--text-primary)">$1</strong>',
            ),
          }}
        />
        <div
          style={{
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border-faint)",
          }}
          dangerouslySetInnerHTML={{
            __html: narrative.domain_context.replace(
              /\*\*(.*?)\*\*/g,
              '<strong style="color:var(--text-primary)">$1</strong>',
            ),
          }}
        />
      </motion.div>

      {/* Per-Regulation Narratives */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {Object.entries(narrative.regulation_narratives).map(
          ([regKey, regNarrative]) => {
            const reg = regulations[regKey];
            if (!reg) return null;
            const isExpanded = expandedReg === regKey;
            const isCompliant = reg.status === "compliant";

            return (
              <motion.div
                key={regKey}
                className="card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ padding: "20px 24px", cursor: "pointer" }}
                onClick={() => toggleReg(regKey)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {isCompliant ? (
                      <CheckCircle2 size={18} color="#8FA89B" />
                    ) : (
                      <AlertTriangle size={18} color="#C89D7C" />
                    )}
                    <div>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {reg.short_name}
                      </span>
                      <span
                        className="pill"
                        style={{
                          marginLeft: 10,
                          fontSize: "0.6rem",
                          background: isCompliant
                            ? "rgba(143,168,155,0.12)"
                            : "rgba(200,157,124,0.12)",
                          borderColor: isCompliant
                            ? "rgba(143,168,155,0.3)"
                            : "rgba(200,157,124,0.3)",
                          color: isCompliant ? "#8FA89B" : "#C89D7C",
                        }}
                      >
                        {regNarrative.passed_count}/{regNarrative.total_count}{" "}
                        passed
                      </span>
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={16} color="var(--text-muted)" />
                  </motion.div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          paddingTop: 16,
                          borderTop: "1px solid var(--border-faint)",
                          marginTop: 14,
                        }}
                      >
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            marginBottom: 12,
                          }}
                        >
                          {regNarrative.intro}
                        </p>
                        <p
                          style={{
                            fontSize: "0.88rem",
                            color: "var(--text-primary)",
                            lineHeight: 1.6,
                            marginBottom: 12,
                            fontWeight: 500,
                          }}
                        >
                          {regNarrative.status_narrative}
                        </p>
                        {regNarrative.failure_details.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <span
                              className="stat-label"
                              style={{ marginBottom: 8, display: "block" }}
                            >
                              Specific Gaps
                            </span>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {regNarrative.failure_details.map((detail, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: "8px 12px",
                                    background: "rgba(162,74,70,0.06)",
                                    borderRadius: 6,
                                    border: "1px solid rgba(162,74,70,0.12)",
                                    fontSize: "0.82rem",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.5,
                                  }}
                                  dangerouslySetInnerHTML={{
                                    __html: detail.replace(
                                      /\*\*(.*?)\*\*/g,
                                      "<strong>$1</strong>",
                                    ),
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          },
        )}
      </div>

      {/* Remediation Actions */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setShowRemediation(!showRemediation)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Lightbulb size={20} color="var(--accent)" />
            <span className="section-title" style={{ margin: 0 }}>
              Prioritized Remediation Plan (
              {narrative.remediation_actions.length} actions)
            </span>
          </div>
          <motion.div
            animate={{ rotate: showRemediation ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={16} color="var(--text-muted)" />
          </motion.div>
        </div>

        <AnimatePresence>
          {showRemediation && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ marginTop: 20 }}>
                {narrative.remediation_actions.map((action) => (
                  <motion.div
                    key={action.priority}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: action.priority * 0.06 }}
                    style={{
                      display: "flex",
                      gap: 16,
                      padding: "16px 18px",
                      marginBottom: 10,
                      background: "var(--surface-inset)",
                      borderRadius: 10,
                      border: "1px solid var(--border-faint)",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "rgba(200,157,124,0.1)",
                        border: "1px solid rgba(200,157,124,0.2)",
                        display: "grid",
                        placeItems: "center",
                        fontFamily: "var(--font-display)",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "var(--accent)",
                        flexShrink: 0,
                      }}
                    >
                      {action.priority}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            color: "var(--text-primary)",
                          }}
                        >
                          {action.action}
                        </span>
                        <span
                          className="pill"
                          style={{
                            fontSize: "0.6rem",
                            padding: "2px 8px",
                            color: "var(--accent)",
                            borderColor: "rgba(200,157,124,0.2)",
                          }}
                        >
                          {action.category}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: "0.82rem",
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {action.detail}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
