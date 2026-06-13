/** Audit Report Export — generates a downloadable HTML report with all findings. */

import type {
  PipelineFullResult,
  DataAuditResult,
  ModelBiasResult,
  Scores,
  FixRecommendation,
  GroupStatDetail,
} from "../types";

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
    html += `<h3 style="color:#C89D7C;margin:20px 0 10px;font-size:0.95rem">${attr}</h3>`;
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
        `<td style="padding:8px 12px;font-weight:500">${group}</td>` +
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

 
export function generateAuditReport(
  data: PipelineFullResult,
  narrative?: Record<string, unknown>,
): string {
  const scores: Scores = data.scores || {};
  const fairnessScore = data.fairness_score ?? 0;
  const decision = data.decision ?? "UNKNOWN";
  const modelBias = data.model_bias;
  const dataAudit = data.data_audit;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BIAS-0 Audit Report — Score ${Math.round(fairnessScore)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono&display=swap');
  * { box-sizing: border-box; margin: 0; }
  body {
    font-family: 'Space Grotesk', sans-serif;
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
  .header h1 { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; letter-spacing: -0.01em; color: #F3F2F1; }
  .header .meta { color: #AFAAA6; font-size: 0.85rem; margin-top: 8px; }
  .header .score { font-family: 'Playfair Display', serif; font-size: 4rem; font-weight: 700; color: ${scoreColor(fairnessScore)}; margin: 16px 0 8px; }
  .section { margin-bottom: 36px; }
  .section h2 {
    font-family: 'Playfair Display', serif;
    font-size: 1.3rem;
    font-weight: 600;
    color: #C89D7C;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(200,157,124,0.12);
  }
  .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .footer { text-align: center; padding-top: 32px; border-top: 1px solid rgba(200,157,124,0.12); color: #78726D; font-size: 0.78rem; margin-top: 40px; }
  @media print {
    body { background: #0C0B0A; }
    .report-container { max-width: 100%; padding: 20px; }
    .section { page-break-inside: avoid; }
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
    narrative
      ? `
  <div class="section">
    <h2>Compliance Analysis & Remediation</h2>
    ${renderComplianceNarrative(narrative)}
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
        <span style="color:#AFAAA6;margin-left:8px">${dataAudit.under_represented_groups.join(", ")}</span>
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
          <div style="font-weight:500;font-size:0.9rem">${s.name}</div>
          <div style="font-size:0.75rem;color:#AFAAA6">Drop: ${s.fairness_drop} points</div>
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

  <div class="footer">
    <p>BIAS-0 — The Fairness Guardian for AI</p>
    <p style="margin-top:4px">This report was generated automatically. Retain for compliance documentation.</p>
  </div>
</div>
</body>
</html>`;
}

 
export function downloadAuditReport(
  data: PipelineFullResult,
  filename?: string,
  narrative?: Record<string, unknown>,
) {
  const html = generateAuditReport(data, narrative);
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
