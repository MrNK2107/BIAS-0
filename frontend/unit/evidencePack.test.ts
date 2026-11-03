/**
 * Unit tests for the evidence-pack JSON/CSV export and the report's provenance
 * section. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVIDENCE_PACK_SCHEMA,
  EVIDENCE_PACK_VERSION,
  CSV_COLUMNS,
  buildEvidencePack,
  csvCell,
  evidenceCsv,
  evidenceCsvRows,
} from "../src/utils/evidencePack";
import { generateAuditReport, renderProvenance } from "../src/utils/reportExport";
import type {
  CalibrationSummary,
  PipelineFullResult,
  Provenance,
  RigourAttribute,
} from "../src/types";

// SHA-256("abc"), FIPS 180-2 test vector
const SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const AT = new Date("2026-11-01T12:00:00Z");
const FORMULA = '=HYPERLINK("x")';

const cal = (n: number, ece: number, reliable = true): CalibrationSummary => ({
  n,
  ece,
  mce: 0.3,
  brier: 0.18,
  reliable,
  bins: [
    { lower: 0, upper: 0.1, count: 40, mean_predicted: 0.05, observed_rate: 0.1 },
    { lower: 0.9, upper: 1, count: 60, mean_predicted: 0.95, observed_rate: 0.7 },
  ],
});

function attribute(): RigourAttribute {
  return {
    n_rows: 1000,
    n_groups: 2,
    n_reliable_groups: 2,
    gaps_scope: "all_groups",
    gaps: {
      demographic_parity_difference: { point: 0.18, ci_lower: 0.12, ci_upper: 0.24, se: 0.03 },
      disparate_impact_ratio: { point: 0.69, ci_lower: 0.6, ci_upper: 0.8, se: 0.05 },
    },
    groups: {
      female: {
        count: 500, positives: 250, negatives: 250, selection_rate: 0.4,
        selection_rate_ci: [0.357, 0.444], tpr: 0.7, fpr: 0.1, fnr: 0.3,
        reliable: true, warnings: [],
      },
      [FORMULA]: {
        count: 500, positives: 250, negatives: 250, selection_rate: 0.58,
        selection_rate_ci: [0.536, 0.623], tpr: 0.8, fpr: 0.13, fnr: 0.2,
        reliable: true, warnings: [],
      },
    },
    groups_omitted: 0,
    n_small_groups: 0,
    small_groups: [],
    unreliable: false,
    calibration: {
      overall: cal(1000, 0.041),
      by_group: { female: cal(500, 0.052), [FORMULA]: cal(500, 0.033) },
      ece_gap: 0.019,
    },
  };
}

const provenance: Provenance = {
  schema_version: "1.0.0",
  generated_at: "2026-11-01T11:59:00",
  input: {
    filename: "loans.csv", sha256: SHA, size_bytes: 3, n_rows: 1000, n_columns: 5,
    columns: ["a", "b", "c", "gender", "approved"],
  },
  model: { used: "tuned_logreg", sha256: null },
  config: {
    sensitive_cols: ["gender"],
    target_col: "approved",
    domain: "loan",
    metric_weights: { dpd: 0.5 },
    unified_score_weights: { model_bias_score: 0.25 },
    statistical_rigour: { n_boot: 1000, seed: 42, ci_level: 0.95, min_group_size: 30 },
  },
  versions: {
    bias0: "0.4.0",
    metrics: { bootstrap_ci: "1.0.0", calibration: "1.0.0" },
    libraries: { numpy: "2.5.4", shap: null },
  },
};

function result(withProvenance = true): PipelineFullResult {
  return {
    fairness_score: 72,
    decision: "LOW RISK",
    model_used: "tuned_logreg",
    scores: { data_bias_score: 80, model_bias_score: 70 },
    model_bias: {
      fairness_score: 70,
      risk_level: "Yellow",
      overall_accuracy: 0.81,
      metrics: { demographic_parity_difference: 0.18 } as never,
      group_performance: {},
      model_used: "tuned_logreg",
      statistical_rigour: {
        config: {
          n_boot: 1000, seed: 42, ci_level: 0.95, min_group_size: 30,
          min_rate_denominator: 10, calibration_bins: 10, ci_method: "percentile",
        },
        per_attribute: { gender: attribute() },
        intersectional: {},
        warnings: [],
      },
    },
    stress: {
      baseline: { fairness_score: 70, accuracy: 0.8 },
      overall_fragility: "low",
      scenarios: [
        {
          name: "Shift", fairness_score: 65, accuracy: 0.79, fairness_drop: 5, fragile: false,
          statistically_significant: false,
          dpd_ci: { point: 0.2, ci_lower: 0.1, ci_upper: 0.3, se: 0.05 },
          baseline_dpd_ci: { point: 0.18, ci_lower: 0.12, ci_upper: 0.24, se: 0.03 },
          note: "", baseline_fairness_score: 70, baseline_accuracy: 0.8,
        },
      ],
    },
    explanations: [{ record_id: 7 } as never],
    ...(withProvenance ? { provenance } : {}),
  };
}

test("evidence pack is versioned and carries provenance, CIs and calibration bins", () => {
  const pack = buildEvidencePack(result(), AT);
  assert.equal(pack.schema, EVIDENCE_PACK_SCHEMA);
  assert.equal(pack.schema_version, EVIDENCE_PACK_VERSION);
  assert.equal(pack.exported_at, "2026-11-01T12:00:00.000Z");
  assert.equal(pack.provenance?.input.sha256, SHA);
  assert.equal(pack.summary.fairness_score, 72);
  assert.equal(pack.summary.overall_accuracy, 0.81);
  const g = pack.statistical_rigour!.per_attribute.gender;
  assert.deepEqual(g.gaps.demographic_parity_difference, {
    point: 0.18, ci_lower: 0.12, ci_upper: 0.24, se: 0.03,
  });
  assert.equal(g.calibration!.by_group.female.bins.length, 2);
  assert.equal(pack.stress[0].statistically_significant, false);
  // record-level explanations are not exported
  assert.ok(!("explanations" in pack));
  assert.equal(pack.provenance_note, undefined);
  // round-trips through JSON unchanged
  assert.deepEqual(JSON.parse(JSON.stringify(pack)), pack);
});

test("older runs without provenance get an explicit note", () => {
  const pack = buildEvidencePack(result(false), AT);
  assert.equal(pack.provenance, null);
  assert.match(pack.provenance_note!, /predates provenance/);
});

test("csvCell quotes, escapes and neutralises formulas", () => {
  assert.equal(csvCell(0.25), "0.25");
  assert.equal(csvCell(-0.01), "-0.01"); // numbers are never prefixed
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(Number.NaN), "");
  assert.equal(csvCell(true), "true");
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-1"), "'-1");
  assert.equal(csvCell(FORMULA), `"'=HYPERLINK(""x"")"`);
});

test("CSV has a fixed header and the known metric values", () => {
  const pack = buildEvidencePack(result(), AT);
  const lines = evidenceCsv(pack).trimEnd().split("\r\n");
  assert.equal(lines[0], CSV_COLUMNS.join(","));
  const has = (l: string) => assert.ok(lines.includes(l), `missing CSV line: ${l}`);
  has(`provenance,,,input_sha256,${SHA},,,,,`);
  has("attribute_gap,gender,,demographic_parity_difference,0.18,0.12,0.24,1000,true,");
  has("attribute_gap,gender,,disparate_impact_ratio,0.69,0.6,0.8,1000,true,");
  has("attribute_group,gender,female,selection_rate,0.4,0.357,0.444,500,true,");
  has("calibration,gender,female,ece,0.052,,,500,true,");
  has("reliability_bin,gender,female,observed_rate,0.7,,,60,true,0.90-1.00");
  has("reliability_bin,gender,(overall),mean_predicted,0.05,,,40,true,0.00-0.10");
  has("calibration,gender,,ece_gap,0.019,,,,,");
  has("stress,,Shift,demographic_parity_difference,0.2,0.1,0.3,,,");
  has("metric_version,,,bootstrap_ci,1.0.0,,,,,");
  // the formula-looking group name is neutralised
  assert.ok(
    lines.some((l) => l.startsWith(`attribute_group,gender,"'=HYPERLINK(""x"")",selection_rate`)),
  );
  // 3 calibration summaries x (3 metrics + 2 bins x 2) + ece_gap = 22; 2 gaps; 2 groups x 4
  const rows = evidenceCsvRows(pack);
  assert.equal(rows.filter((r) => r.attribute === "gender").length, 22 + 2 + 8);
});

test("HTML report shows provenance with the input hash and a print button", () => {
  const html = generateAuditReport(result());
  assert.match(html, /<h2>Provenance<\/h2>/);
  assert.ok(html.includes(SHA));
  assert.match(html, /1000 resamples, seed 42, 95% CI, min group 30/);
  assert.match(html, /BIAS-0 0\.4\.0/);
  assert.match(html, /numpy 2\.5\.4/);
  assert.ok(!html.includes("shap null"));
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /@media print/);
  assert.match(renderProvenance(undefined), /predates provenance/);
});

test("NYC LL144 table, with an excluded small category, goes into the pack and CSV", () => {
  const nyc = {
    race: {
      rate_type: "selection" as const,
      categories: [
        { category: "B", rate: 0.4, impact_ratio: 0.8, n: 390 },
        { category: "A", rate: 0.5, impact_ratio: 1, n: 600 },
      ],
      most_selected: "A",
      min_impact_ratio: 0.8,
      unknown_categories: [],
      unknown_count: 0,
      excluded_categories: [{ category: "C", n: 10, share: 0.01, rate: 0.1 }],
      exclusion_justification: "too small",
      exclusion_note: null,
    },
  };
  const pack = buildEvidencePack(result(), AT, nyc);
  assert.deepEqual(pack.nyc_ll144, nyc);
  const lines = evidenceCsv(pack).trimEnd().split("\r\n");
  assert.ok(lines.includes("nyc_ll144,race,B,impact_ratio,0.8,,,390,,"));
  assert.ok(lines.includes("nyc_ll144_excluded,race,C,selection_rate,0.1,,,10,,"));
  assert.ok(lines.includes("nyc_ll144_excluded,race,,justification,too small,,,,,"));
  // packs built without a compliance table keep the field null
  assert.equal(buildEvidencePack(result(), AT).nyc_ll144, null);
});
