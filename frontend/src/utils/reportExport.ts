/** Audit Report Export — generates a downloadable HTML report with all findings. */

import type {
  PipelineFullResult,
  DataAuditResult,
  ModelBiasResult,
  Scores,
  FixRecommendation,
  GroupStatDetail,
  StatisticalRigour,
  RigourAttribute,
  CalibrationSummary,
  GapWithCI,
  StressScenario,
  Provenance,
} from "../types";
import {
  chartGroups,
  reliabilityGeometry,
  reliabilitySummary,
} from "./reliability";
import { inputNames, ll144RateTypeText, positiveLabelText, targetEncodingText } from "./provenance";
import { describeExcluded, type ImpactRatioTable } from "./compliance";

/** Escape user-controlled text (column and group names come from the dataset). */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreColor(score: number): string {
  if (score < 50) return "#A24A46";
  if (score < 75) return "#C89D7C";
  return "#8FA89B";
}

function riskBadge(risk: string): string {
  const colors: Record<string, string> = {
    Red: "#A24A46",
    "HIGH RISK": "#A24A46",
    Yellow: "#C89D7C",
    "MODERATE RISK": "#C89D7C",
    Green: "#8FA89B",
    "LOW RISK": "#8FA89B",
  };
  const bg = colors[risk] || "#78726D";
  return `<span style="background:${bg}22;color:${bg};padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:600;border:1px solid ${bg}44">${risk}</span>`;
}

function scoreBar(score: number, label: string): string {
  const color = scoreColor(score);
  return `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:0.8rem;color:#AFAAA6">${label}</span>
        <span style="font-weight:700;color:${color}">${Math.round(score)}</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden">
        <div style="height:100%;width:${Math.max(0, Math.min(100, score))}%;background:linear-gradient(90deg,${color},${color}aa);border-radius:999px;transition:width 1s ease"></div>
      </div>
    </div>
  `;
}

function renderGroupStats(dataAudit: DataAuditResult | undefined): string {
  if (!dataAudit?.group_stats)
    return '<p style="color:#78726D">No group statistics available</p>';

  let html = "";
  for (const [attr, groups] of Object.entries(dataAudit.group_stats)) {
    html += `<h3 style="color:#C89D7C;margin:20px 0 10px;font-size:0.95rem">${esc(attr)}</h3>`;
    html +=
      '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
    html +=
      '<tr style="color:#78726D;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.12em">' +
      '<th style="text-align:left;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">Group</th>' +
      '<th style="text-align:right;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">Count</th>' +
      '<th style="text-align:right;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">Approval Rate</th>' +
      '<th style="text-align:right;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">Missing Rate</th>' +
      '<th style="text-align:center;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">Representation</th>' +
      "</tr>";
    for (const [group, stats] of Object.entries(groups)) {
      const g = stats as GroupStatDetail;
      html +=
        `<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">` +
        `<td style="padding:8px 12px;font-weight:500">${esc(group)}</td>` +
        `<td style="padding:8px 12px;text-align:right;color:#AFAAA6">${g.count}</td>` +
        `<td style="padding:8px 12px;text-align:right;color:${g.positive_rate > 0.7 ? "#8FA89B" : "#A24A46"}">${(g.positive_rate * 100).toFixed(1)}%</td>` +
        `<td style="padding:8px 12px;text-align:right;color:#78726D">${(g.missing_rate * 100).toFixed(1)}%</td>` +
        `<td style="padding:8px 12px;text-align:center">${
          g.under_represented
            ? '<span style="color:#A24A46">⚠ Under-represented</span>'
            : '<span style="color:#8FA89B">✓ Adequate</span>'
        }</td>` +
        "</tr>";
    }
    html += "</table>";
  }
  return html;
}

function renderFairnessMetrics(modelBias: ModelBiasResult | undefined): string {
  if (!modelBias?.metrics)
    return '<p style="color:#78726D">No fairness metrics available</p>';

  const { metrics } = modelBias;
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
      <div style="background:rgba(0,0,0,0.2);padding:14px;border-radius:8px">
        <div style="font-size:0.7rem;color:#78726D;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">Demographic Parity</div>
        <div style="font-weight:700;font-size:1.3rem;color:${(metrics.demographic_parity_difference || 0) > 0.2 ? "#A24A46" : "#8FA89B"}">${((metrics.demographic_parity_difference || 0) * 100).toFixed(1)}%</div>
      </div>
      <div style="background:rgba(0,0,0,0.2);padding:14px;border-radius:8px">
        <div style="font-size:0.7rem;color:#78726D;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">Equal Opportunity</div>
        <div style="font-weight:700;font-size:1.3rem;color:${(metrics.equal_opportunity_difference || 0) > 0.2 ? "#A24A46" : "#8FA89B"}">${((metrics.equal_opportunity_difference || 0) * 100).toFixed(1)}%</div>
      </div>
      <div style="background:rgba(0,0,0,0.2);padding:14px;border-radius:8px">
        <div style="font-size:0.7rem;color:#78726D;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">FPR Gap</div>
        <div style="font-weight:700;font-size:1.3rem;color:${(metrics.fpr_gap || 0) > 0.2 ? "#A24A46" : "#8FA89B"}">${((metrics.fpr_gap || 0) * 100).toFixed(1)}%</div>
      </div>
      <div style="background:rgba(0,0,0,0.2);padding:14px;border-radius:8px">
        <div style="font-size:0.7rem;color:#78726D;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">FNR Gap</div>
        <div style="font-weight:700;font-size:1.3rem;color:${(metrics.fnr_gap || 0) > 0.2 ? "#A24A46" : "#8FA89B"}">${((metrics.fnr_gap || 0) * 100).toFixed(1)}%</div>
      </div>
    </div>
  `;
}

 
// ── Statistical reliability (core/rigour.py) ────────────────────────────────

const RIGOUR_GAP_LABELS: Record<string, string> = {
  demographic_parity_difference: "Demographic parity difference",
  equal_opportunity_difference: "Equal opportunity (TPR) gap",
  fpr_gap: "False positive rate gap",
  fnr_gap: "False negative rate gap",
  equalized_odds_difference: "Equalized odds difference",
  disparate_impact_ratio: "Disparate impact ratio",
};

const fmt3 = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(3);
const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`;

/** Plain-language reading of a gap CI (0 = parity for gaps, 1 for the DI ratio). */
export function gapEvidence(key: string, g: GapWithCI): string {
  if (g.ci_lower === null || g.ci_upper === null) return "Not enough groups";
  const excludes =
    key === "disparate_impact_ratio" ? g.ci_upper < 1 : g.ci_lower > 0;
  return excludes ? "Disparity (CI excludes parity)" : "Inconclusive";
}

/** " · DPD x (CI a to b) vs baseline ..." for a stress scenario, or "". */
export function stressCiText(s: StressScenario): string {
  const d = s.dpd_ci;
  const b = s.baseline_dpd_ci;
  if (!d || !b || d.ci_lower === null || b.ci_lower === null) return "";
  return (
    ` · DPD ${fmt3(d.point)} (CI ${fmt3(d.ci_lower)} to ${fmt3(d.ci_upper)})` +
    ` vs baseline ${fmt3(b.point)} (CI ${fmt3(b.ci_lower)} to ${fmt3(b.ci_upper)})` +
    (s.statistically_significant ? " · CIs do not overlap" : " · CIs overlap")
  );
}

const TH =
  'style="text-align:left;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.08);color:#AFAAA6;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em"';
const TD = 'style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.04)"';

function reliabilitySvg(name: string, s: CalibrationSummary): string {
  const size = 180;
  const pad = 26;
  const g = reliabilityGeometry(s.bins, size, pad);
  const colour = s.reliable === false ? "#AFAAA6" : "#C89D7C";
  const dash = s.reliable === false ? ' stroke-dasharray="2 3"' : "";
  const ticks = g.ticks
    .map(
      (t) =>
        `<text x="${t.pos}" y="${size - pad + 12}" text-anchor="middle" font-size="9" fill="#AFAAA6">${t.value}</text>` +
        `<text x="${pad - 4}" y="${size - t.pos + 3}" text-anchor="end" font-size="9" fill="#AFAAA6">${t.value}</text>`,
    )
    .join("");
  const dots = g.points
    .map((p) => `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${colour}"/>`)
    .join("");
  return `<figure style="margin:0;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;text-align:center">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(reliabilitySummary(name, s))}">
      <rect x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}" fill="none" stroke="rgba(200,157,124,0.22)"/>
      ${ticks}
      <text x="${size / 2}" y="${size - 3}" text-anchor="middle" font-size="9" fill="#AFAAA6">Predicted</text>
      <text x="9" y="${size / 2}" text-anchor="middle" font-size="9" fill="#AFAAA6" transform="rotate(-90 9 ${size / 2})">Observed</text>
      <path d="${g.diagonal}" stroke="#78726D" stroke-dasharray="4 4" fill="none"/>
      <path d="${g.path}" stroke="${colour}" stroke-width="2"${dash} fill="none"/>
      ${dots}
    </svg>
    <figcaption style="font-size:0.75rem;color:#AFAAA6">${esc(name)} · n=${s.n} · ECE ${fmt3(s.ece)}${s.reliable === false ? " · too small" : ""}</figcaption>
  </figure>`;
}

function renderRigourAttribute(
  label: string,
  res: RigourAttribute,
  ciPct: number,
): string {
  const scope =
    res.gaps_scope === "reliable_groups"
      ? `${res.n_reliable_groups} of ${res.n_groups} groups large enough to count`
      : `all ${res.n_groups} groups`;
  let html = `<h3 style="color:#C89D7C;margin:20px 0 8px;font-size:0.95rem">${esc(label)}</h3>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:12px">
    <caption style="text-align:left;color:#AFAAA6;font-size:0.78rem;margin-bottom:6px">Fairness gaps with ${ciPct}% confidence intervals (${scope})</caption>
    <tr><th ${TH}>Metric</th><th ${TH}>Value</th><th ${TH}>${ciPct}% CI</th><th ${TH}>SE</th><th ${TH}>Evidence</th></tr>`;
  for (const [key, g] of Object.entries(res.gaps)) {
    const ci =
      g.ci_lower === null || g.ci_upper === null
        ? "not computed"
        : `${fmt3(g.ci_lower)} to ${fmt3(g.ci_upper)}`;
    html += `<tr><td ${TD}>${esc(RIGOUR_GAP_LABELS[key] ?? key)}</td><td ${TD}>${fmt3(g.point)}</td><td ${TD}>${ci}</td><td ${TD}>${fmt3(g.se)}</td><td ${TD}>${gapEvidence(key, g)}</td></tr>`;
  }
  html += "</table>";

  const cal = res.calibration;
  const omitted =
    res.groups_omitted > 0
      ? ` (largest ${Object.keys(res.groups).length} groups; ${res.groups_omitted} more not listed)`
      : "";
  html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
    <caption style="text-align:left;color:#AFAAA6;font-size:0.78rem;margin-bottom:6px">Per-group rates, sample sizes${cal ? " and calibration" : ""}${omitted}</caption>
    <tr><th ${TH}>Group</th><th ${TH}>Rows</th><th ${TH}>Selection rate (${ciPct}% CI)</th><th ${TH}>TPR</th><th ${TH}>FPR</th>${cal ? `<th ${TH}>ECE</th><th ${TH}>Brier</th>` : ""}<th ${TH}>Status</th></tr>`;
  for (const [name, g] of Object.entries(res.groups)) {
    const c = cal?.by_group[name];
    const status =
      g.warnings.length === 0
        ? '<span style="color:#8FA89B">OK</span>'
        : `<span style="color:${g.reliable ? "#C89D7C" : "#A24A46"}">${g.reliable ? "Check rates" : "Too small"}</span><div style="font-size:0.72rem;color:#AFAAA6">${esc(g.warnings.join(" "))}</div>`;
    html += `<tr><td ${TD}>${esc(name)}</td><td ${TD}>${g.count}</td><td ${TD}>${fmtPct(g.selection_rate)} (${fmtPct(g.selection_rate_ci[0])} to ${fmtPct(g.selection_rate_ci[1])})</td><td ${TD}>${fmtPct(g.tpr)}</td><td ${TD}>${fmtPct(g.fpr)}</td>${cal ? `<td ${TD}>${fmt3(c?.ece)}</td><td ${TD}>${fmt3(c?.brier)}</td>` : ""}<td ${TD}>${status}</td></tr>`;
  }
  html += "</table>";

  if (cal) {
    html += `<p style="margin:10px 0;font-size:0.82rem;color:#AFAAA6">Calibration: overall ECE ${fmt3(cal.overall.ece)}, MCE ${fmt3(cal.overall.mce)}, Brier ${fmt3(cal.overall.brier)}. ${
      cal.ece_gap !== null
        ? `ECE differs by ${fmt3(cal.ece_gap)} between the best- and worst-calibrated reliable groups.`
        : "Not enough reliable groups to compare calibration."
    }</p>`;
    const charts = chartGroups(cal.by_group, 8);
    if (charts.length) {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${charts
        .map(([n, s]) => reliabilitySvg(n, s))
        .join("")}</div>`;
    }
  }
  return html;
}

/** "Statistical Reliability" report section: CIs, small-group warnings, calibration. */
export function renderStatisticalRigour(
  rigour: StatisticalRigour | undefined,
): string {
  if (!rigour?.per_attribute || Object.keys(rigour.per_attribute).length === 0)
    return '<p style="color:#78726D">No statistical reliability data available</p>';
  const cfg = rigour.config;
  const ciPct = Math.round((cfg?.ci_level ?? 0.95) * 100);
  let html = `<p style="font-size:0.85rem;color:#AFAAA6;margin-bottom:12px">${ciPct}% confidence intervals from ${cfg?.n_boot ?? 0} bootstrap resamples (${esc(cfg?.ci_method ?? "bootstrap")}, seed ${cfg?.seed}). Groups with fewer than ${cfg?.min_group_size} rows are flagged as unreliable, as are rates with fewer than ${cfg?.min_rate_denominator} actual positives or negatives. Intersectional gaps use only groups that meet the minimum size.</p>`;
  if (rigour.warnings?.length) {
    html += `<div style="padding:12px;background:rgba(162,74,70,0.1);border:1px solid rgba(162,74,70,0.2);border-radius:8px;margin-bottom:12px">
      <strong style="color:#A24A46">Small-group warnings</strong>
      <ul style="margin:6px 0 0 18px;color:#AFAAA6;font-size:0.82rem">${rigour.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    </div>`;
  }
  for (const [k, res] of Object.entries(rigour.per_attribute))
    html += renderRigourAttribute(k, res, ciPct);
  for (const [k, res] of Object.entries(rigour.intersectional ?? {}))
    html += renderRigourAttribute(`${k} (intersectional)`, res, ciPct);
  return html;
}

function renderComplianceNarrative(
  narrative: Record<string, unknown> | undefined,
): string {
  if (!narrative) return "";

  const formatBold = (text: string) =>
    text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  let html = "";

  // Executive summary
  html += `<div style="background:rgba(200,157,124,0.06);padding:20px;border-radius:12px;margin-bottom:20px;border-left:3px solid #C89D7C">
    <div style="font-size:0.7rem;color:#C89D7C;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;margin-bottom:8px">Executive Summary</div>
    <div style="font-size:0.9rem;line-height:1.6;color:#AFAAA6">${formatBold((narrative.executive_summary as string) || "No executive summary")}</div>
  </div>`;

  // Domain context
  if (narrative.domain_context) {
    html += `<div style="font-size:0.85rem;line-height:1.6;color:#AFAAA6;margin-bottom:20px">${formatBold(narrative.domain_context as string)}</div>`;
  }

  // Per-regulation narratives
  if (narrative.regulation_narratives) {
    html +=
      '<h3 style="color:#C89D7C;font-size:1rem;margin-bottom:12px">Regulation Details</h3>';
    for (const [regKey, regNarrative] of Object.entries(
      narrative.regulation_narratives as Record<string, Record<string, unknown>>,
    )) {
      const rn = regNarrative as Record<string, unknown>;
      const isCompliant =
        rn.passed_count === rn.total_count;
      html += `<div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:10px;border-left:3px solid ${isCompliant ? "#8FA89B" : "#C89D7C"}">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-weight:600;font-size:0.85rem;color:#F3F2F1">${regKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
          <span style="font-size:0.7rem;color:${isCompliant ? "#8FA89B" : "#C89D7C"}">${rn.passed_count as string}/${rn.total_count as string} passed</span>
        </div>
        <p style="margin:4px 0;font-size:0.82rem;color:#AFAAA6;line-height:1.5">${(rn.intro as string) || ""}</p>
        <p style="margin:4px 0;font-size:0.85rem;color:${isCompliant ? "#8FA89B" : "#C89D7C"};line-height:1.5">${(rn.status_narrative as string) || ""}</p>`;

      if (
        rn.failure_details &&
        (rn.failure_details as unknown[]).length > 0
      ) {
        html += '<div style="margin-top:8px">';
        for (const detail of rn.failure_details as string[]) {
          html += `<div style="padding:6px 10px;font-size:0.78rem;color:#A24A46;background:rgba(162,74,70,0.06);border-radius:4px;margin-bottom:4px">${formatBold(detail)}</div>`;
        }
        html += "</div>";
      }
      html += "</div>";
    }
  }

  // Remediation actions
  const remediationActions = narrative.remediation_actions as unknown as Array<Record<string, unknown>>;
  if (
    remediationActions &&
    remediationActions.length > 0
  ) {
    html +=
      '<h3 style="color:#C89D7C;font-size:1rem;margin:16px 0 12px">Prioritized Remediation Plan</h3>';
    for (const action of remediationActions) {
      html += `<div style="display:flex;gap:12px;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:8px">
        <div style="width:24px;height:24px;border-radius:6px;background:rgba(200,157,124,0.15);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#C89D7C;flex-shrink:0">${action.priority as string}</div>
        <div>
          <div style="font-weight:600;font-size:0.85rem;color:#F3F2F1;margin-bottom:2px">${action.action as string} <span style="font-size:0.65rem;color:#C89D7C;font-weight:400">(${action.category as string})</span></div>
          <p style="font-size:0.8rem;color:#AFAAA6;margin:0;line-height:1.4">${action.detail as string}</p>
        </div>
      </div>`;
    }
  }

  return html;
}

/**
 * "NYC Local Law 144" report section: per-attribute selection (or scoring) rates and
 * impact ratios as 6 RCNY 5-301 asks, with unknown-category counts and any
 * category the auditor excluded under 5-301(d). The rule sets no pass/fail
 * threshold; the four-fifths row is the EEOC heuristic, shown for reference.
 */
export function renderLl144Section(
  tables: Record<string, ImpactRatioTable> | null | undefined,
): string {
  const entries = Object.entries(tables ?? {});
  if (!entries.length) return "";
  const pct = (v: number | null | undefined) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "n/a");
  const ratio = (v: number | null | undefined) => (typeof v === "number" ? v.toFixed(3) : "n/a");
  const note = `<p style="font-size:0.82rem;color:#AFAAA6;margin-bottom:12px">Reporting only: the DCWP rule (6 RCNY 5-300/5-301) asks the audit to calculate and report these rates and impact ratios. It sets no pass/fail threshold. Impact ratio = rate of the category ÷ rate of the most selected category.</p>`;
  const body = entries
    .map(([attr, t]) => {
      const rateLabel = t.rate_type === "scoring" ? "Scoring rate" : "Selection rate";
      const rateRule = t.rate_type === "scoring" ? "5-301(c): share scored above the full-sample median" : "5-301(b)";
      const rows = t.categories
        .map(
          (c) =>
            `<tr><td ${TD}>${esc(c.category)}</td><td ${TD}>${c.n ?? "n/a"}</td><td ${TD}>${pct(c.rate)}</td><td ${TD}>${ratio(c.impact_ratio)}</td></tr>`,
        )
        .join("");
      const min = t.min_impact_ratio;
      const fourFifths =
        typeof min === "number"
          ? `lowest ratio ${ratio(min)} is ${min >= 0.8 ? "at or above" : "below"} 0.80`
          : "lowest ratio not available";
      const heuristic = `<tr><th scope="row" style="text-align:left;padding:6px 10px;font-weight:600">Four-fifths rule (EEOC heuristic, not an LL144 threshold)</th><td ${TD} colspan="3">${fourFifths}. Informational only.</td></tr>`;
      const unknownCount = t.unknown_count ?? 0;
      const unknown = `<p style="font-size:0.8rem;color:#AFAAA6;margin-top:6px">Unknown category: ${unknownCount} individuals not included in the calculations${t.unknown_categories?.length ? ` (${esc(t.unknown_categories.join(", "))})` : ""} (6 RCNY 5-301).</p>`;
      const excluded = t.excluded_categories?.length
        ? `<p style="font-size:0.8rem;color:#AFAAA6;margin-top:4px">Excluded by the auditor (under 2% of the data, 5-301(d)): ${t.excluded_categories.map((ex) => esc(describeExcluded(ex))).join("; ")}. Justification: ${t.exclusion_justification ? esc(t.exclusion_justification) : "<strong>justification missing</strong>"}.</p>`
        : "";
      const exclusionNote = t.exclusion_note ? `<p style="font-size:0.8rem;color:#AFAAA6;margin-top:4px">${esc(t.exclusion_note)}</p>` : "";
      return `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;margin-top:14px">
        <caption style="text-align:left;font-weight:600;color:#F3F2F1;padding-bottom:6px">${esc(attr)}: ${rateLabel.toLowerCase()} (${rateRule}); most selected: ${esc(t.most_selected ?? "n/a")}</caption>
        <thead><tr><th scope="col" ${TH}>Category</th><th scope="col" ${TH}>n</th><th scope="col" ${TH}>${rateLabel}</th><th scope="col" ${TH}>Impact ratio</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${heuristic}</tfoot>
      </table>${unknown}${excluded}${exclusionNote}`;
    })
    .join("");
  return note + body;
}

function renderRecommendations(recs: FixRecommendation[] | undefined): string {
  if (!recs || recs.length === 0)
    return '<p style="color:#78726D">No recommendations</p>';
  return recs
    .map(
      (r, i) => `
    <div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:10px;border-left:3px solid ${r.fix_type === "feature_level" ? "#C89D7C" : r.fix_type === "data_level" ? "#8FA89B" : "#A24A46"}">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:600;font-size:0.85rem">${i + 1}. ${r.issue || r.description}</span>
        <span style="font-size:0.65rem;padding:2px 8px;background:rgba(200,157,124,0.12);border-radius:4px;color:#C89D7C">${r.fix_type}</span>
      </div>
      <p style="margin:4px 0 0;font-size:0.8rem;color:#AFAAA6">${r.description}</p>
      ${r.estimated_impact ? `<p style="margin:6px 0 0;font-size:0.75rem;color:#8FA89B">${r.estimated_impact}</p>` : ""}
    </div>
  `,
    )
    .join("");
}

 
/** "Provenance" report section: input hash, settings and versions behind the numbers. */
export function renderProvenance(p: Provenance | undefined): string {
  if (!p)
    return '<p style="color:#AFAAA6">This run predates provenance capture. Re-run the audit to record the input hash and versions.</p>';
  const rc = p.config.statistical_rigour;
  const names = inputNames(p.input);
  const rows: [string, string][] = [
    ["Input file", `${esc(names.original)} (${p.input.n_rows} rows, ${p.input.n_columns} columns, ${p.input.size_bytes} bytes)`],
    ...(names.stored
      ? ([["Stored as", `<code style="font-family:'IBM Plex Mono',monospace;word-break:break-all">${esc(names.stored)}</code>`]] as [string, string][])
      : []),
    ["Input SHA-256", `<code style="font-family:'IBM Plex Mono',monospace;word-break:break-all">${esc(p.input.sha256)}</code>`],
    ["Model", `${esc(p.model.used)}${p.model.sha256 ? ` · SHA-256 <code style="font-family:'IBM Plex Mono',monospace;word-break:break-all">${esc(p.model.sha256)}</code>` : ""}`],
    ["Target / sensitive", `${esc(p.config.target_col)} / ${esc(p.config.sensitive_cols.join(", "))}`],
    ["Positive class", esc(positiveLabelText(p.config.positive_label))],
    ["Target encoding", esc(targetEncodingText(p.config.target_binarisation))],
    ["NYC LL144 rate", esc(ll144RateTypeText(p.config.ll144_rate_type))],
    ["Bootstrap", `${rc.n_boot ?? "n/a"} resamples, seed ${rc.seed ?? "n/a"}, ${rc.ci_level !== undefined ? Math.round(rc.ci_level * 100) : "n/a"}% CI, min group ${rc.min_group_size ?? "n/a"}`],
    ["Versions", `BIAS-0 ${esc(p.versions.bias0)} · ${Object.entries(p.versions.metrics).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ")}`],
    ["Libraries", Object.entries(p.versions.libraries).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ")],
    ["Analysed at", esc(p.generated_at)],
  ];
  return `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">${rows
    .map(([k, v]) => `<tr><th scope="row" ${TH}>${k}</th><td ${TD}>${v}</td></tr>`)
    .join("")}</table>`;
}

// ── Theme ───────────────────────────────────────────────────────────────────
// The report is written with the app's dark palette. applyReportTheme turns
// every palette colour into a CSS variable so the same file has a light theme
// (and dark-theme red/grey text lifted to WCAG AA contrast)
// (OS preference, or the toggle button) as well as the ink-friendly print sheet.

const PALETTE: Record<string, { name: string; dark: string; light: string }> = {
  "0C0B0A": { name: "bg", dark: "#0C0B0A", light: "#FBF9F6" },
  F3F2F1: { name: "text", dark: "#F3F2F1", light: "#1F1B18" },
  AFAAA6: { name: "muted", dark: "#AFAAA6", light: "#4F4944" },
  "78726D": { name: "subtle", dark: "#8E8883", light: "#5F5852" },
  C89D7C: { name: "accent", dark: "#C89D7C", light: "#7A4D2C" },
  A24A46: { name: "red", dark: "#D9837E", light: "#9A3B37" },
  "8FA89B": { name: "green", dark: "#8FA89B", light: "#3F6B55" },
};

const rgbTriplet = (hex: string) =>
  [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16)).join(" ");

function themeVars(mode: "dark" | "light"): string {
  const vars = Object.values(PALETTE).flatMap((c) => [
    `--${c.name}: ${c[mode]};`,
    `--${c.name}-rgb: ${rgbTriplet(c[mode])};`,
  ]);
  vars.push(mode === "dark" ? "--ink-rgb: 255 255 255;" : "--ink-rgb: 40 30 20;");
  vars.push(mode === "dark" ? "--shade: rgba(0,0,0,0.2);" : "--shade: rgba(60,40,20,0.05);");
  return vars.join(" ");
}

export const REPORT_THEME_CSS = `
  :root { color-scheme: dark; ${themeVars("dark")} }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { color-scheme: light; ${themeVars("light")} } }
  :root[data-theme="light"] { color-scheme: light; ${themeVars("light")} }`;

const HEX_TO_VAR = new RegExp(`#(${Object.keys(PALETTE).join("|")})([0-9A-Fa-f]{2})?(?![0-9A-Fa-f])`, "gi");

function themeColour(value: string): string {
  return value
    .replace(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.2\s*\)/g, "var(--shade)")
    .replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g, "rgb(var(--ink-rgb) / $1)")
    .replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (m, r, g, b, a) => {
      const hex = [r, g, b].map((x: string) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase();
      const c = PALETTE[hex];
      return c ? `rgb(var(--${c.name}-rgb) / ${a})` : m;
    })
    .replace(HEX_TO_VAR, (_m, hex: string, alpha?: string) => {
      const c = PALETTE[hex.toUpperCase()];
      return alpha
        ? `rgb(var(--${c.name}-rgb) / ${(parseInt(alpha, 16) / 255).toFixed(2)})`
        : `var(--${c.name})`;
    });
}

/**
 * Replace palette colours with theme variables: inside style attributes and
 * the stylesheet directly, and on SVG fill/stroke attributes by moving them
 * into a style attribute (presentation attributes cannot use var()).
 */
export function applyReportTheme(html: string): string {
  return html
    .replace(/<style>([\s\S]*?)<\/style>/, (_m, css: string) => `<style>${REPORT_THEME_CSS}\n${themeColour(css)}</style>`)
    .replace(/<(circle|rect|path|text|line|polyline)\b([^>]*?)(\/?)>/g, (m, tag: string, attrs: string, close: string) => {
      const props: string[] = [];
      const rest = attrs.replace(/\s(fill|stroke)="([^"]*)"/g, (a, prop: string, val: string) => {
        const themed = themeColour(val);
        if (themed === val) return a;
        props.push(`${prop}:${themed}`);
        return "";
      });
      return props.length ? `<${tag}${rest} style="${props.join(";")}"${close}>` : m;
    })
    .replace(/\sstyle="([^"]*)"/g, (_m, css: string) => ` style="${themeColour(css)}"`);
}

export function generateAuditReport(
  data: PipelineFullResult,
  narrative?: Record<string, unknown>,
  nycLl144?: Record<string, ImpactRatioTable> | null,
): string {
  const ll144Html = renderLl144Section(nycLl144);
  const scores: Scores = data.scores || {};
  const fairnessScore = data.fairness_score ?? 0;
  const decision = data.decision ?? "UNKNOWN";
  const modelBias = data.model_bias;
  const dataAudit = data.data_audit;

  return applyReportTheme(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BIAS-0 Audit Report — Score ${Math.round(fairnessScore)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono&display=swap');
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: 'IBM Plex Sans', sans-serif;
    background: #0C0B0A;
    color: #F3F2F1;
    font-size: 14px;
    line-height: 1.6;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  .report-container { max-width: 900px; margin: 0 auto; padding: 40px 32px; }
  .header {
    text-align: center;
    padding-bottom: 32px;
    border-bottom: 1px solid rgba(200,157,124,0.12);
    margin-bottom: 32px;
  }
  .header h1 { font-family: 'Fraunces', serif; font-size: 2.2rem; font-weight: 700; letter-spacing: -0.01em; color: #F3F2F1; }
  .header .meta { color: #AFAAA6; font-size: 0.85rem; margin-top: 8px; }
  .header .score { font-family: 'Fraunces', serif; font-size: 4rem; font-weight: 700; color: ${scoreColor(fairnessScore)}; margin: 16px 0 8px; }
  .section { margin-bottom: 36px; }
  .section h2 {
    font-family: 'Fraunces', serif;
    font-size: 1.3rem;
    font-weight: 600;
    color: #C89D7C;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(200,157,124,0.12);
  }
  .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .footer { text-align: center; padding-top: 32px; border-top: 1px solid rgba(200,157,124,0.12); color: #78726D; font-size: 0.78rem; margin-top: 40px; }
  .print-btn { font: inherit; font-size: 0.8rem; margin-top: 14px; padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(200,157,124,0.4); background: transparent; color: #C89D7C; cursor: pointer; }
  /* Save as PDF: ink-friendly light theme. Inline colours are overridden. */
  @media print {
    @page { margin: 14mm; }
    body, .report-container, .report-container * { background: transparent !important; color: #1a1a1a !important; border-color: #ccc !important; box-shadow: none !important; }
    body { background: #fff !important; font-size: 11pt; }
    .report-container { max-width: 100%; padding: 0; }
    .section, figure, tr { break-inside: avoid; page-break-inside: avoid; }
    svg text { fill: #333 !important; }
    svg rect { stroke: #bbb !important; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="report-container">
  <div class="header">
    <h1>BIAS-0 Fairness Audit Report</h1>
    <div class="meta">
      Generated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}<br>
      ${data.model_used ? `Model: ${data.model_used}` : ""}
    </div>
    <div class="score">${Math.round(fairnessScore)}</div>
    <div style="font-size:0.8rem;color:#78726D;letter-spacing:0.12em;text-transform:uppercase">Unified Fairness Score</div>
    <div style="margin-top:8px">${riskBadge(decision)}</div>
    ${data.provenance ? `<div class="meta">Input ${esc(inputNames(data.provenance.input).original)} · SHA-256 <code style="font-family:'IBM Plex Mono',monospace">${esc(data.provenance.input.sha256.slice(0, 16))}…</code></div>` : ""}
    <button class="print-btn no-print" type="button" onclick="window.print()">Print / Save as PDF</button>
    <button class="print-btn no-print" type="button" aria-label="Switch between light and dark theme" onclick="var r=document.documentElement,l=r.dataset.theme?r.dataset.theme==='light':matchMedia('(prefers-color-scheme: light)').matches;r.dataset.theme=l?'dark':'light'">Light / dark</button>
  </div>

  <div class="section">
    <h2>Stage Scores</h2>
    <div class="score-grid">
      ${scoreBar(scores.data_bias_score ?? 0, "Data Bias")}
      ${scoreBar(scores.model_bias_score ?? 0, "Model Bias")}
      ${scoreBar(scores.proxy_risk_score ?? 0, "Proxy Risk")}
      ${scoreBar(scores.counterfactual_score ?? 0, "Counterfactual")}
    </div>
    <div style="grid-column:1/-1">
      ${scoreBar(scores.stress_test_score ?? 0, "Stress Test")}
    </div>
  </div>

  <div class="section">
    <h2>Fairness Metrics</h2>
    ${renderFairnessMetrics(modelBias)}
    ${modelBias?.overall_accuracy ? `<p style="margin-top:12px;font-size:0.85rem;color:#AFAAA6">Overall Accuracy: <strong style="color:#F3F2F1">${(modelBias.overall_accuracy * 100).toFixed(1)}%</strong></p>` : ""}
    ${modelBias?.risk_level ? `<p style="margin-top:4px;font-size:0.85rem;color:#AFAAA6">Risk Level: ${riskBadge(modelBias.risk_level)}</p>` : ""}
  </div>

  ${
    modelBias?.statistical_rigour
      ? `
  <div class="section">
    <h2>Statistical Reliability</h2>
    ${renderStatisticalRigour(modelBias.statistical_rigour)}
  </div>
  `
      : ""
  }

  ${
    narrative
      ? `
  <div class="section">
    <h2>Compliance Analysis & Remediation</h2>
    ${renderComplianceNarrative(narrative)}
  </div>
  `
      : ""
  }

  ${
    ll144Html
      ? `
  <div class="section">
    <h2>NYC Local Law 144: impact ratios</h2>
    ${ll144Html}
  </div>
  `
      : ""
  }

  <div class="section">
    <h2>Data Audit — Group Statistics</h2>
    ${renderGroupStats(dataAudit)}
    ${
      dataAudit?.under_represented_groups?.length
        ? `
      <div style="margin-top:12px;padding:12px;background:rgba(162,74,70,0.1);border:1px solid rgba(162,74,70,0.2);border-radius:8px">
        <strong style="color:#A24A46">Under-represented groups detected:</strong>
        <span style="color:#AFAAA6;margin-left:8px">${esc(dataAudit.under_represented_groups.join(", "))}</span>
      </div>
    `
        : ""
    }
  </div>

  <div class="section">
    <h2>Recommendations</h2>
    ${renderRecommendations(data.recommendations)}
  </div>

  <div class="section">
    <h2>Counterfactual Analysis</h2>
    ${
      data.counterfactual
        ? `
      <div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:8px">
        <div style="font-size:0.7rem;color:#78726D;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">Flip Rate</div>
        <div style="font-weight:700;font-size:1.5rem;color:${(data.counterfactual.flip_rate || 0) > 0.2 ? "#A24A46" : "#8FA89B"}">${((data.counterfactual.flip_rate || 0) * 100).toFixed(1)}%</div>
        <p style="margin-top:8px;font-size:0.85rem;color:#AFAAA6">${data.counterfactual.interpretation || ""}</p>
      </div>
    `
        : '<p style="color:#78726D">No counterfactual data available</p>'
    }
  </div>

  <div class="section">
    <h2>Stress Test Results</h2>
    ${
      data.stress?.scenarios
        ? data.stress.scenarios
            .map(
              (s) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:8px">
        <div>
          <div style="font-weight:500;font-size:0.9rem">${esc(s.name)}</div>
          <div style="font-size:0.75rem;color:#AFAAA6">Drop: ${s.fairness_drop} points${stressCiText(s)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:1.1rem;color:${scoreColor(s.fairness_score)}">${Math.round(s.fairness_score)}</div>
          ${s.fragile ? '<span style="font-size:0.65rem;color:#A24A46;border:1px solid rgba(162,74,70,0.3);padding:2px 6px;border-radius:4px">FRAGILE</span>' : ""}
        </div>
      </div>
    `,
            )
            .join("")
        : '<p style="color:#78726D">No stress test data available</p>'
    }
  </div>

  <div class="section">
    <h2>Provenance</h2>
    ${renderProvenance(data.provenance)}
  </div>

  <div class="footer">
    <p>BIAS-0 — The Fairness Guardian for AI</p>
    <p style="margin-top:4px">This report was generated automatically. Retain for compliance documentation.</p>
  </div>
</div>
</body>
</html>`);
}

 
export function downloadAuditReport(
  data: PipelineFullResult,
  filename?: string,
  narrative?: Record<string, unknown>,
  nycLl144?: Record<string, ImpactRatioTable> | null,
) {
  const html = generateAuditReport(data, narrative, nycLl144);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename || `bias0-audit-${new Date().toISOString().split("T")[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
