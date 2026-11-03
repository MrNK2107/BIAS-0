/**
 * Unit tests for the outcome-audit helpers used by the Assurance page.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAuditForm,
  driftChartData,
  findingCounts,
  intervalText,
  mappingFromInspection,
  mappingProblems,
  pct,
  reportFilename,
  toneOf,
  type Inspection,
  type Mapping,
} from "../src/utils/assurance";

const inspection: Inspection = {
  n_rows: 6000,
  filename: "sample.csv",
  sha256: "a".repeat(64),
  columns: [],
  suggested: {
    decision_col: "decision",
    outcome_col: null,
    score_col: "model_score",
    time_col: "decision_date",
    group_cols: ["gender", "caste_category"],
  },
};

test("suggested roles become a mapping with blanks for missing roles", () => {
  const m = mappingFromInspection(inspection);
  assert.equal(m.decision_col, "decision");
  assert.equal(m.outcome_col, "");
  assert.deepEqual(m.group_cols, ["gender", "caste_category"]);
  assert.equal(m.threshold, 0.8);
  // a copy, not the inspection's array
  m.group_cols.push("x");
  assert.deepEqual(inspection.suggested.group_cols, ["gender", "caste_category"]);
});

test("mapping problems block the run in a useful order", () => {
  const base = mappingFromInspection(inspection);
  assert.deepEqual(mappingProblems(base), []);
  assert.deepEqual(mappingProblems({ ...base, decision_col: "", group_cols: [] }), [
    "Choose the decision column.",
    "Choose at least one group column.",
  ]);
  assert.ok(mappingProblems({ ...base, group_cols: ["decision"] }).some((p) => p.includes("cannot also")));
  assert.ok(mappingProblems({ ...base, threshold: 1.4 }).some((p) => p.includes("threshold")));
});

test("the form omits blank optional fields and sends groups as JSON", () => {
  const m: Mapping = { ...mappingFromInspection(inspection), system_name: "PL-Score", organisation: " " };
  const fd = buildAuditForm(new Blob(["a,b\n1,2\n"]), "log.csv", m);
  assert.equal(fd.get("decision_col"), "decision");
  assert.equal(fd.get("group_cols"), '["gender","caste_category"]');
  assert.equal(fd.get("outcome_col"), null);
  assert.equal(fd.get("time_col"), "decision_date");
  assert.equal(fd.get("system_name"), "PL-Score"); // labels the ledger entry too
  assert.equal(fd.get("record"), null);
  assert.equal(fd.get("threshold"), "0.8");
  const report = buildAuditForm(new Blob(["x"]), "log.csv", m, true);
  assert.equal(report.get("system_name"), "PL-Score");
  assert.equal(report.get("organisation"), null);
  assert.equal(report.get("record"), "false"); // rendering a report is not a new audit
  assert.equal((report.get("file") as File).name, "log.csv");
});

test("tones follow severity across verdicts, periods and controls", () => {
  assert.equal(toneOf("disparity"), "bad");
  assert.equal(toneOf("breach"), "bad");
  assert.equal(toneOf("inconclusive"), "warn");
  assert.equal(toneOf("partial"), "warn");
  assert.equal(toneOf("no_material_disparity"), "good");
  assert.equal(toneOf("insufficient"), "muted");
  assert.equal(toneOf("not_evidenced"), "muted");
});

test("number formatting is honest about missing values", () => {
  assert.equal(pct(0.4523), "45.2%");
  assert.equal(pct(null), "n/a");
  assert.equal(intervalText({ point: 0.78, ci_lower: 0.69, ci_upper: 0.85 }), "0.78 (95% CI 0.69–0.85)");
  assert.equal(intervalText({ point: 0.9, ci_lower: null, ci_upper: null }), "0.90");
  assert.equal(intervalText({ point: null, ci_lower: null, ci_upper: null }), "n/a");
});

test("drift chart rows carry a range band and leave gaps for insufficient periods", () => {
  const rows = driftChartData([
    { period: "2026-04", n: 500, impact_ratio: 0.89, ci_lower: 0.8, ci_upper: 0.97, lowest_group: "rural", status: "ok" },
    { period: "2026-05", n: 12, impact_ratio: null, ci_lower: null, ci_upper: null, lowest_group: null, status: "insufficient" },
  ]);
  assert.deepEqual(rows[0].band, [0.8, 0.97]);
  assert.equal(rows[1].band, null);
  assert.equal(rows[1].impact_ratio, null);
});

test("finding counts and report file name", () => {
  const counts = findingCounts([
    { scope: "attribute", name: "a", status: "disparity", label: "", text: "" },
    { scope: "drift", name: "b", status: "disparity", label: "", text: "" },
    { scope: "attribute", name: "c", status: "inconclusive", label: "", text: "" },
  ]);
  assert.deepEqual(counts, { disparity: 2, inconclusive: 1, no_material_disparity: 0 });
  const name = reportFilename(
    { provenance: { filename: "x", sha256: "deadbeefcafe", rows: 1, generated_at: "" } },
    new Date("2026-11-02T10:00:00Z"),
  );
  assert.equal(name, "bias0-assurance-2026-11-02-deadbeef.html");
});

test("drift badge keeps a past breach visible after recovery", async () => {
  const { driftLabel, driftTone } = await import("../src/utils/assurance");
  assert.equal(driftTone("2026-05", "breach"), "bad");
  assert.equal(driftLabel("2026-05", "breach"), "breach since 2026-05");
  assert.equal(driftTone("2026-05", "ok"), "warn");
  assert.equal(driftLabel("2026-05", "ok"), "breached from 2026-05 · latest ok");
  assert.equal(driftTone(null, "watch"), "warn");
  assert.equal(driftLabel(null, "ok"), "latest: ok");
});

test("biggest change since the previous audit picks the largest absolute move", async () => {
  const { biggestChange } = await import("../src/utils/assurance");
  assert.equal(biggestChange(null), null);
  const best = biggestChange({
    previous_seq: 1, previous_recorded_at: "", same_input: false, grade_from: "C", grade_to: "E",
    changes: {
      gender: { from: 0.97, to: 0.98, delta: 0.01, status_from: "no_material_disparity", status_to: "no_material_disparity" },
      region_tier: { from: 0.89, to: 0.6, delta: -0.29, status_from: "no_material_disparity", status_to: "disparity" },
    },
  });
  assert.equal(best?.name, "region_tier");
  assert.equal(best?.delta, -0.29);
});

test("trade-off attributes need score and outcome, worst ratio first; summary sentences", async () => {
  const m = await import("../src/utils/assurance");
  const block = (point: number, reliable = 2) => ({
    n_rows: 100, n_groups: 2, n_reliable_groups: reliable,
    gaps: { demographic_parity_difference: { point: 0.1, ci_lower: 0, ci_upper: 0.2 }, disparate_impact_ratio: { point, ci_lower: point - 0.05, ci_upper: point + 0.05 } },
    groups: {}, small_groups: [], n_small_groups: 0, unknown_count: 0,
    verdict: { status: "inconclusive" as const, label: "", reason: "" },
  });
  const audit = {
    mapping: { decision_col: "d", group_cols: ["x", "y", "z"], outcome_col: "o", score_col: "s", time_col: null },
    attributes: { x: block(0.9), y: block(0.7), z: block(0.5, 1) },
  } as unknown as Parameters<typeof m.tradeoffAttributes>[0];
  assert.deepEqual(m.tradeoffAttributes(audit), ["y", "x"]);
  assert.deepEqual(m.tradeoffAttributes({ ...audit, mapping: { ...audit.mapping, score_col: null } }), []);

  const pt = (strength: number, ir: number, acc: number) => ({ strength, accuracy: acc, selection_rate: 0.5, impact_ratio: ir, tpr_gap: 0.1, group_rates: {}, thresholds: {} });
  const base = { attribute: "y", n_fit: 1, n_holdout: 1, threshold: 0.8, baseline_selection_rate: 0.5, reliable_groups: [], caveat: "", method: "" };
  assert.match(
    m.tradeoffSummary({ ...base, points: [pt(0, 0.7, 0.71), pt(0.4, 0.82, 0.7)], smallest_sufficient: { strength: 0.4, impact_ratio: 0.82, accuracy: 0.7, accuracy_cost: 0.01 } }),
    /0\.70 to 0\.82 for 1\.0 points of accuracy/,
  );
  assert.match(m.tradeoffSummary({ ...base, points: [pt(0, 0.7, 0.7)], smallest_sufficient: null }), /not a thresholding problem/);
  const fd = m.buildTradeoffForm(new Blob(["x"]), "f.csv", { ...m.mappingFromInspection({ n_rows: 1, filename: "", sha256: "", columns: [], suggested: { decision_col: "d", outcome_col: "o", score_col: "s", time_col: null, group_cols: [] } }) }, "y");
  assert.equal(fd.get("group_col"), "y");
  assert.equal(fd.get("score_col"), "s");
  assert.equal(fd.get("decision_col"), "d");
});

test("breach window starts at the earliest sustained breach period", async () => {
  const m = await import("../src/utils/assurance");
  const series = (breach_start: string | null) => ({ points: [], trend_per_period: null, breach_periods: 0, insufficient_periods: 0, breach_start });
  const audit = {
    mapping: { decision_col: "d", group_cols: [], outcome_col: null, score_col: null, time_col: "t" },
    drift: {
      period: "M", period_label: "month", alerts: [], threshold: 0.8, n_boot: 10,
      periods: [{ period: "2026-04", start: "2026-04-01", n: 1, selection_rate: 0.5 }, { period: "2026-05", start: "2026-05-01", n: 1, selection_rate: 0.5 }, { period: "2026-07", start: "2026-07-01", n: 1, selection_rate: 0.5 }],
      series: { a: series("2026-07"), b: series("2026-05"), c: series(null) },
    },
  } as unknown as Parameters<typeof m.breachWindow>[0];
  assert.deepEqual(m.breachWindow(audit), { since: "2026-05-01", label: "2026-05" });
  assert.equal(m.breachWindow({ ...audit, drift: null } as typeof audit), null);
  const fd = m.buildTradeoffForm(new Blob(["x"]), "f.csv", { ...m.mappingFromInspection({ n_rows: 1, filename: "", sha256: "", columns: [], suggested: { decision_col: "d", outcome_col: "o", score_col: "s", time_col: "t", group_cols: [] } }) }, "y", "2026-05-01");
  assert.equal(fd.get("since"), "2026-05-01");
  assert.equal(fd.get("time_col"), "t");
});

test("groupActions keeps priority order and drops empty groups; linkFor finds an attribute's change", async () => {
  const m = await import("../src/utils/assurance");
  const a = (priority: "now" | "next" | "record", title: string) => ({ priority, title, owner: "o", detail: "d", evidence: "e" });
  const groups = m.groupActions([a("record", "sign"), a("now", "review"), a("now", "investigate")]);
  assert.deepEqual(groups.map((g) => g.priority), ["now", "record"]);
  assert.deepEqual(groups[0].items.map((i) => i.title), ["review", "investigate"]);
  assert.deepEqual(m.groupActions(undefined), []);
  const link = { attribute: "sex", onset: "2026-07", column: "screener_version", period: "2026-07", from: "s1.4", to: "s1.5", version_like: true, impact_ratio_before: 0.96, impact_ratio_after: 0.56, lowest_group_after: "Female", text: "" };
  assert.equal(m.linkFor({ changes: [], links: [link], note: "" }, "sex")?.to, "s1.5");
  assert.equal(m.linkFor({ changes: [], links: [link], note: "" }, "race"), undefined);
  assert.equal(m.linkFor(null, "sex"), undefined);
});

test("decision log template has the recognised columns and parses back as a mapping", async () => {
  const m = await import("../src/utils/assurance");
  const csv = m.decisionLogTemplate();
  const [head, ...rows] = csv.trim().split("\n");
  assert.deepEqual(head.split(","), [...m.TEMPLATE_COLUMNS]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.split(",").length === m.TEMPLATE_COLUMNS.length));
});
