/**
 * Unit tests for the HTML audit-report export and reliability-diagram geometry.
 * Run with `npm run test:unit` (esbuild bundles this file, then `node --test`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esc,
  gapEvidence,
  generateAuditReport,
  renderStatisticalRigour,
  stressCiText,
} from "../src/utils/reportExport";
import {
  chartGroups,
  reliabilityGeometry,
  reliabilitySummary,
} from "../src/utils/reliability";
import type {
  CalibrationSummary,
  PipelineFullResult,
  RigourAttribute,
  StatisticalRigour,
  StressScenario,
} from "../src/types";

const gap = (point: number, lo: number | null, hi: number | null) => ({
  point,
  ci_lower: lo,
  ci_upper: hi,
  se: lo === null ? null : 0.012,
});

const cal = (n: number, ece: number, reliable = true): CalibrationSummary => ({
  n,
  ece,
  mce: ece * 2,
  brier: 0.18,
  reliable,
  bins: [
    { lower: 0, upper: 0.1, count: Math.round(n / 2), mean_predicted: 0.05, observed_rate: 0.1 },
    { lower: 0.9, upper: 1, count: Math.round(n / 2), mean_predicted: 0.95, observed_rate: 0.7 },
  ],
});

function attribute(): RigourAttribute {
  return {
    n_rows: 1012,
    n_groups: 3,
    n_reliable_groups: 2,
    gaps_scope: "all_groups",
    gaps: {
      demographic_parity_difference: gap(0.1834, 0.1211, 0.2402),
      disparate_impact_ratio: gap(0.71, 0.62, 0.83),
      fpr_gap: gap(0.03, -0.01, 0.07),
    },
    groups: {
      female: {
        count: 500, positives: 250, negatives: 250, selection_rate: 0.4,
        selection_rate_ci: [0.357, 0.444], tpr: 0.7, fpr: 0.1, fnr: 0.3,
        reliable: true, warnings: [],
      },
      male: {
        count: 500, positives: 250, negatives: 250, selection_rate: 0.58,
        selection_rate_ci: [0.536, 0.623], tpr: 0.8, fpr: 0.13, fnr: 0.2,
        reliable: true, warnings: [],
      },
      "<script>alert(1)</script>": {
        count: 12, positives: 5, negatives: 7, selection_rate: 0.5,
        selection_rate_ci: [0.25, 0.75], tpr: 0.6, fpr: 0.3, fnr: 0.4,
        reliable: false,
        warnings: ["Only 12 rows (minimum 30): all metrics for this group are unreliable."],
      },
    },
    groups_omitted: 0,
    n_small_groups: 1,
    small_groups: [{ group: "<script>alert(1)</script>", count: 12 }],
    unreliable: true,
    calibration: {
      overall: cal(1012, 0.041),
      by_group: {
        female: cal(500, 0.052),
        male: cal(500, 0.033),
        "<script>alert(1)</script>": cal(12, 0.2, false),
      },
      ece_gap: 0.019,
    },
  };
}

function rigour(): StatisticalRigour {
  const inter = { ...attribute(), gaps_scope: "reliable_groups" as const, columns: ["gender", "caste"] };
  return {
    config: {
      n_boot: 1000, seed: 42, ci_level: 0.95, min_group_size: 30,
      min_rate_denominator: 10, calibration_bins: 10,
      ci_method: "percentile bootstrap, stratified by group",
    },
    per_attribute: { gender: attribute() },
    intersectional: { "gender × caste": inter },
    warnings: ["gender: 1 group(s) below 30 rows - <script>alert(1)</script> (n=12)."],
  };
}

test("report includes the statistical reliability section with CIs", () => {
  const html = renderStatisticalRigour(rigour());
  assert.match(html, /95% confidence intervals from 1000 bootstrap resamples/);
  assert.match(html, /0\.183/); // DPD point
  assert.match(html, /0\.121 to 0\.240/); // DPD CI
  assert.match(html, /Disparity \(CI excludes parity\)/);
  assert.match(html, /Inconclusive/); // fpr gap CI spans 0
  assert.match(html, /40\.0% \(35\.7% to 44\.4%\)/); // Wilson selection-rate CI
  assert.match(html, /gender × caste \(intersectional\)/);
  assert.match(html, /2 of 3 groups large enough to count/);
});

test("report includes small-group warnings and per-group status", () => {
  const html = renderStatisticalRigour(rigour());
  assert.match(html, /Small-group warnings/);
  assert.match(html, /Too small/);
  assert.match(html, /Only 12 rows \(minimum 30\)/);
});

test("report includes calibration numbers and labelled reliability diagrams", () => {
  const html = renderStatisticalRigour(rigour());
  assert.match(html, /overall ECE 0\.041, MCE 0\.082, Brier 0\.180/);
  assert.match(html, /ECE differs by 0\.019/);
  const svgs = html.match(/<svg [^>]*role="img"[^>]*aria-label="Reliability diagram for [^"]+"/g) ?? [];
  assert.equal(svgs.length, 6); // 3 groups x (attribute + intersection)
  assert.match(html, /n=500 · ECE 0\.052/);
});

test("user-controlled names are escaped", () => {
  const html = renderStatisticalRigour(rigour());
  assert.ok(!html.includes("<script>"), "raw <script> must not reach the report");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(esc(`a"b'<>&`), "a&quot;b&#39;&lt;&gt;&amp;");
});

test("full report embeds the section only when rigour data exists", () => {
  const base = {
    fairness_score: 72,
    decision: "MODERATE RISK",
    scores: {},
    model_bias: { metrics: {}, statistical_rigour: rigour() },
  } as unknown as PipelineFullResult;
  assert.match(generateAuditReport(base), /<h2>Statistical Reliability<\/h2>/);
  const without = {
    ...base,
    model_bias: { metrics: {} },
  } as unknown as PipelineFullResult;
  assert.doesNotMatch(generateAuditReport(without), /Statistical Reliability/);
  assert.match(renderStatisticalRigour(undefined), /No statistical reliability data/);
});

test("stress scenarios show their bootstrap DPD CIs", () => {
  const s = {
    name: "Under-sampling",
    fairness_score: 60, accuracy: 0.8, fairness_drop: 12, fragile: false,
    statistically_significant: true,
    dpd_ci: gap(0.3, 0.25, 0.35),
    baseline_dpd_ci: gap(0.1, 0.06, 0.14),
    note: "", baseline_fairness_score: 72, baseline_accuracy: 0.81,
  } as StressScenario;
  assert.equal(
    stressCiText(s),
    " · DPD 0.300 (CI 0.250 to 0.350) vs baseline 0.100 (CI 0.060 to 0.140) · CIs do not overlap",
  );
  assert.equal(stressCiText({ ...s, dpd_ci: null }), "");
  const report = generateAuditReport({
    fairness_score: 70, scores: {}, stress: { scenarios: [s] },
  } as unknown as PipelineFullResult);
  assert.match(report, /CIs do not overlap/);
});

test("gapEvidence treats the DI ratio against 1 and gaps against 0", () => {
  assert.equal(gapEvidence("disparate_impact_ratio", gap(0.7, 0.6, 0.9)), "Disparity (CI excludes parity)");
  assert.equal(gapEvidence("disparate_impact_ratio", gap(0.9, 0.8, 1.1)), "Inconclusive");
  assert.equal(gapEvidence("fpr_gap", gap(0, null, null)), "Not enough groups");
});

test("reliability geometry maps probabilities onto the plot square", () => {
  const g = reliabilityGeometry(cal(100, 0.1).bins, 200, 20);
  // (0.05, 0.1) -> x = 20 + 0.05*160 = 28, y = 180 - 0.1*160 = 164
  assert.equal(g.points[0].cx, 28);
  assert.equal(g.points[0].cy, 164);
  assert.equal(g.diagonal, "M20 180 L180 20");
  assert.match(g.path, /^M28 164 L172 68$/);
  assert.ok(g.points.every((p) => p.r >= 2 && p.r <= 6));
});

test("chartGroups keeps the largest groups and skips empty ones", () => {
  const groups = {
    b: cal(50, 0.1),
    a: cal(50, 0.1),
    big: cal(900, 0.1),
    empty: { ...cal(0, 0), bins: [] },
  };
  assert.deepEqual(chartGroups(groups, 2).map(([n]) => n), ["big", "a"]);
  assert.equal(chartGroups(groups).length, 3);
});

test("reliability summary names the worst bin and its direction", () => {
  const text = reliabilitySummary("female", cal(500, 0.052));
  assert.match(text, /500 rows in 2 score bins, ECE 0\.05/);
  assert.match(text, /0\.90-1\.00 bin: predicted 0\.95, observed 0\.70 \(over-confident\)/);
  assert.match(reliabilitySummary("x", cal(12, 0.2, false)), /unreliable/);
});
