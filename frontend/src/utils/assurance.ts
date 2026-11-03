// Outcome audit (Mode A) types and pure helpers shared by the Assurance page.
// Mirrors backend/core/outcome_audit.py (schema bias0.outcome-audit@1.0.0).

export type VerdictStatus = "disparity" | "inconclusive" | "no_material_disparity";
export type PeriodStatus = "breach" | "watch" | "ok" | "insufficient";
export type ControlStatus = "evidenced" | "partial" | "not_evidenced";
export type Tone = "bad" | "warn" | "good" | "muted";

export interface Interval {
  point: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  se?: number | null;
}

export interface GroupRow {
  count: number;
  selection_rate: number | null;
  selection_rate_ci: [number, number];
  reliable: boolean;
  warnings: string[];
}

export interface Verdict {
  status: VerdictStatus;
  label: string;
  reason: string;
}

export interface SelectionBlock {
  n_rows: number;
  n_groups: number;
  n_reliable_groups: number;
  gaps: { demographic_parity_difference: Interval; disparate_impact_ratio: Interval };
  groups: Record<string, GroupRow>;
  small_groups: { group: string; count: number }[];
  n_small_groups: number;
  unknown_count: number;
  verdict: Verdict;
  columns?: string[];
  error_rates?: {
    n_rows: number;
    gaps: Record<"equal_opportunity_difference" | "fpr_gap" | "fnr_gap" | "equalized_odds_difference", Interval>;
  };
}

export interface ImpactRow {
  category: string;
  rate: number | null;
  impact_ratio: number | null;
  n?: number;
  rate_ci?: [number, number] | null;
  reliable?: boolean;
}

export interface ImpactTable {
  categories: ImpactRow[];
  most_selected: string | null;
  min_impact_ratio: number | null;
  unknown_count: number;
}

export interface DriftPoint {
  period: string;
  n: number;
  impact_ratio: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  lowest_group: string | null;
  status: PeriodStatus;
}

export interface DriftSeries {
  points: DriftPoint[];
  trend_per_period: number | null;
  breach_periods: number;
  insufficient_periods: number;
  breach_start: string | null;
}

export interface Finding {
  scope: "attribute" | "intersection" | "drift";
  name: string;
  status: VerdictStatus;
  label: string;
  text: string;
}

export interface Control {
  framework: string;
  ref: string;
  requirement: string;
  status: ControlStatus;
  evidence: string;
}

export type ActionPriority = "now" | "next" | "record";

export interface ActionItem {
  priority: ActionPriority;
  owner: string;
  title: string;
  detail: string;
  evidence: string;
}

export interface ChangeSwitch {
  column: string;
  period: string;
  from: string;
  to: string;
  version_like: boolean;
}

export interface ChangeLink extends ChangeSwitch {
  attribute: string;
  onset: string;
  impact_ratio_before: number | null;
  impact_ratio_after: number | null;
  lowest_group_after: string | null;
  text: string;
}

export interface ChangePoints {
  changes: ChangeSwitch[];
  links: ChangeLink[];
  note: string;
}

export interface SampleInfo {
  id: string;
  title: string;
  sector: string;
  rows: number;
  window: string;
  story: string;
  frameworks: string[];
  filename: string;
  mapping: {
    decision_col: string;
    group_cols: string[];
    outcome_col: string | null;
    score_col: string | null;
    time_col: string | null;
  };
  system_name: string;
  organisation: string;
}

/** Group an action plan by priority, keeping the server's order inside each group. */
export function groupActions(plan: ActionItem[] | undefined): { priority: ActionPriority; items: ActionItem[] }[] {
  const order: ActionPriority[] = ["now", "next", "record"];
  return order
    .map((priority) => ({ priority, items: (plan ?? []).filter((a) => a.priority === priority) }))
    .filter((g) => g.items.length > 0);
}

/** The change linked to an attribute's drift, if any. */
export function linkFor(cp: ChangePoints | null | undefined, attribute: string): ChangeLink | undefined {
  return cp?.links.find((l) => l.attribute === attribute);
}

export interface OutcomeAudit {
  schema: string;
  n_rows: number;
  n_decisions: number;
  overall_selection_rate: number;
  threshold: number;
  mapping: {
    decision_col: string;
    group_cols: string[];
    outcome_col: string | null;
    score_col: string | null;
    time_col: string | null;
  };
  config: { n_boot: number; seed: number; min_group_size: number; ci_level: number };
  attributes: Record<string, SelectionBlock>;
  intersections: Record<string, SelectionBlock>;
  ll144: {
    selection: { rate_type: string; attributes: Record<string, ImpactTable> };
    scoring?: { rate_type: string; attributes: Record<string, ImpactTable> };
  };
  drift: {
    period: string;
    period_label: string;
    periods: { period: string; start: string; n: number; selection_rate: number }[];
    series: Record<string, DriftSeries>;
    alerts: { attribute: string; level: "breach" | "watch"; period: string; message: string }[];
    threshold: number;
    n_boot: number;
  } | null;
  change_points?: ChangePoints | null;
  action_plan?: ActionItem[];
  outcome_coverage: number | null;
  warnings: string[];
  findings: Finding[];
  verdict: {
    status: VerdictStatus;
    label: string;
    grade: string;
    rule: string;
    worst_impact_ratio: number | null;
    grade_rules: { grade: string; rule: string }[];
  };
  frameworks: {
    catalogue: Record<string, { name: string; scope: string; status_note: string }>;
    controls: Control[];
    summary: Record<string, { evidenced: number; partial: number; not_evidenced: number; total: number; name: string }>;
    disclaimer: string;
  };
  provenance?: { filename: string; sha256: string; rows: number; generated_at: string };
  ledger?: LedgerReceipt | null;
}

export interface LedgerComparison {
  previous_seq: number;
  previous_recorded_at: string;
  same_input: boolean;
  grade_from: string;
  grade_to: string;
  changes: Record<string, { from: number; to: number; delta: number; status_from: VerdictStatus; status_to: VerdictStatus }>;
}

export interface LedgerReceipt {
  seq: number;
  entry_sha256: string;
  prev_entry_sha256: string;
  compared_to_previous: LedgerComparison | null;
}

export interface LedgerEntry {
  seq: number;
  recorded_at: string;
  system_name: string | null;
  input: { filename: string | null; sha256: string | null; rows: number | null };
  mapping: OutcomeAudit["mapping"];
  verdict: { status: VerdictStatus; grade: string; worst_impact_ratio: number | null };
  attributes: Record<string, { status: VerdictStatus; impact_ratio: number | null; ci_lower: number | null; ci_upper: number | null }>;
  drift_alerts: number;
  window: [string, string] | null;
  entry_sha256: string;
  prev_entry_sha256: string;
}

export interface LedgerHistory {
  chain: { ok: boolean; n_entries: number; head_sha256: string; problems: string[] };
  entries: LedgerEntry[];
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  n_unique: number;
  n_missing: number;
  examples: string[];
}

export interface Inspection {
  n_rows: number;
  filename: string;
  sha256: string;
  columns: ColumnInfo[];
  suggested: {
    decision_col: string | null;
    outcome_col: string | null;
    score_col: string | null;
    time_col: string | null;
    group_cols: string[];
  };
}

export interface Mapping {
  decision_col: string;
  group_cols: string[];
  outcome_col: string;
  score_col: string;
  time_col: string;
  positive_decision: string;
  period: "auto" | "W" | "M" | "Q";
  threshold: number;
  system_name: string;
  organisation: string;
}

export const DEFAULT_THRESHOLD = 0.8;

export function mappingFromInspection(ins: Inspection): Mapping {
  const s = ins.suggested;
  return {
    decision_col: s.decision_col ?? "",
    group_cols: [...s.group_cols],
    outcome_col: s.outcome_col ?? "",
    score_col: s.score_col ?? "",
    time_col: s.time_col ?? "",
    positive_decision: "",
    period: "auto",
    threshold: DEFAULT_THRESHOLD,
    system_name: "",
    organisation: "",
  };
}

/** Problems that block running the audit, in the order the user should fix them. */
export function mappingProblems(m: Mapping): string[] {
  const problems: string[] = [];
  if (!m.decision_col) problems.push("Choose the decision column.");
  if (m.group_cols.length === 0) problems.push("Choose at least one group column.");
  if (m.group_cols.includes(m.decision_col)) problems.push("The decision column cannot also be a group column.");
  if (m.group_cols.length > 8) problems.push("At most 8 group columns.");
  if (!(m.threshold >= 0.5 && m.threshold <= 1)) problems.push("The threshold must be between 0.5 and 1.0.");
  return problems;
}

/** Multipart body for /assurance/outcome-audit[/report]. Blank optional fields are omitted. */
export function buildAuditForm(file: Blob, filename: string, m: Mapping, forReport = false): FormData {
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("decision_col", m.decision_col);
  fd.append("group_cols", JSON.stringify(m.group_cols));
  const optional: [string, string][] = [
    ["outcome_col", m.outcome_col],
    ["score_col", m.score_col],
    ["time_col", m.time_col],
    ["positive_decision", m.positive_decision],
    // The system name labels the ledger entry as well as the report.
    ["system_name", m.system_name],
  ];
  if (forReport) {
    // Rendering a report must not append a second ledger entry for the same run.
    optional.push(["organisation", m.organisation], ["record", "false"]);
  }
  for (const [k, v] of optional) {
    if (v && v.trim() !== "") fd.append(k, v.trim());
  }
  fd.append("period", m.period);
  fd.append("threshold", String(m.threshold));
  return fd;
}

export function toneOf(status: VerdictStatus | PeriodStatus | ControlStatus): Tone {
  switch (status) {
    case "disparity":
    case "breach":
      return "bad";
    case "inconclusive":
    case "watch":
    case "partial":
      return "warn";
    case "no_material_disparity":
    case "ok":
    case "evidenced":
      return "good";
    default:
      return "muted";
  }
}

export const CONTROL_LABEL: Record<ControlStatus, string> = {
  evidenced: "Evidenced",
  partial: "Partial",
  not_evidenced: "Not evidenced",
};

export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "n/a";
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "n/a";
  return x.toFixed(digits);
}

export function intervalText(i: Interval | undefined): string {
  if (!i || i.point === null) return "n/a";
  if (i.ci_lower === null || i.ci_upper === null) return num(i.point);
  return `${num(i.point)} (95% CI ${num(i.ci_lower)}–${num(i.ci_upper)})`;
}

/** Rows for a Recharts range band: `band` is [lower, upper] or null for a gap. */
export function driftChartData(points: DriftPoint[]) {
  return points.map((p) => ({
    period: p.period,
    n: p.n,
    status: p.status,
    impact_ratio: p.impact_ratio,
    band:
      p.ci_lower !== null && p.ci_upper !== null
        ? ([p.ci_lower, p.ci_upper] as [number, number])
        : null,
  }));
}

/** Drift card badge: a past sustained breach stays visible even when the latest period recovered. */
export function driftTone(breachStart: string | null, latest: PeriodStatus): Tone {
  if (latest === "breach") return "bad";
  if (breachStart) return "warn";
  return toneOf(latest);
}

export function driftLabel(breachStart: string | null, latest: PeriodStatus): string {
  if (breachStart && latest === "breach") return `breach since ${breachStart}`;
  if (breachStart) return `breached from ${breachStart} · latest ${latest}`;
  return `latest: ${latest}`;
}

export interface TradeoffPoint {
  strength: number;
  accuracy: number;
  selection_rate: number;
  impact_ratio: number | null;
  tpr_gap: number | null;
  group_rates: Record<string, number>;
  thresholds: Record<string, number | null>;
}

export interface Tradeoff {
  attribute: string;
  n_fit: number;
  n_holdout: number;
  threshold: number;
  baseline_selection_rate: number;
  reliable_groups: string[];
  points: TradeoffPoint[];
  smallest_sufficient: { strength: number; impact_ratio: number; accuracy: number; accuracy_cost: number } | null;
  caveat: string;
  method: string;
  window?: { time_col: string; since: string; rows: number } | null;
}

/** Earliest sustained drift breach as a start date, so the trade-off can focus on it. */
export function breachWindow(audit: OutcomeAudit): { since: string; label: string } | null {
  const d = audit.drift;
  if (!d || !audit.mapping.time_col) return null;
  const starts = Object.values(d.series)
    .map((s) => s.breach_start)
    .filter((p): p is string => !!p)
    .sort();
  if (!starts.length) return null;
  const period = d.periods.find((p) => p.period === starts[0]);
  return period ? { since: period.start, label: starts[0] } : null;
}

/** The trade-off needs a score and an outcome; attributes sorted worst impact ratio first. */
export function tradeoffAttributes(audit: OutcomeAudit): string[] {
  if (!audit.mapping.score_col || !audit.mapping.outcome_col) return [];
  return Object.entries(audit.attributes)
    .filter(([, b]) => b.n_reliable_groups >= 2)
    .sort(([, a], [, b]) => (a.gaps.disparate_impact_ratio.point ?? 1) - (b.gaps.disparate_impact_ratio.point ?? 1))
    .map(([name]) => name);
}

export function buildTradeoffForm(file: Blob, filename: string, m: Mapping, attribute: string, since?: string | null): FormData {
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("score_col", m.score_col);
  fd.append("outcome_col", m.outcome_col);
  fd.append("group_col", attribute);
  if (m.decision_col) fd.append("decision_col", m.decision_col);
  if (m.positive_decision.trim()) fd.append("positive_decision", m.positive_decision.trim());
  fd.append("threshold", String(m.threshold));
  if (since && m.time_col) {
    fd.append("time_col", m.time_col);
    fd.append("since", since);
  }
  return fd;
}

/** One-sentence summary of the trade-off for the panel header. */
export function tradeoffSummary(t: Tradeoff): string {
  const base = t.points[0];
  const r = t.smallest_sufficient;
  if (!r) {
    return `No strength reaches an impact ratio of ${t.threshold.toFixed(2)} on the holdout half; the gap is not a thresholding problem alone.`;
  }
  if (r.strength === 0) {
    return `A single threshold already gives an impact ratio of ${num(base.impact_ratio)} on the holdout half (a point estimate; the verdict above carries its interval).`;
  }
  const cost = r.accuracy_cost;
  const costText = cost <= 0 ? "no loss of accuracy" : `${(cost * 100).toFixed(1)} points of accuracy`;
  return `Strength ${r.strength.toFixed(1)} lifts the impact ratio from ${num(base.impact_ratio)} to ${num(r.impact_ratio)} for ${costText} (holdout).`;
}

/** Largest movement (by absolute delta) since the previous audit of the same system. */
export function biggestChange(cmp: LedgerComparison | null | undefined) {
  if (!cmp) return null;
  let best: { name: string; from: number; to: number; delta: number } | null = null;
  for (const [name, c] of Object.entries(cmp.changes)) {
    if (!best || Math.abs(c.delta) > Math.abs(best.delta)) best = { name, ...c };
  }
  return best;
}

/** Count of findings by severity, for the summary strip. */
export function findingCounts(findings: Finding[]): Record<VerdictStatus, number> {
  const out: Record<VerdictStatus, number> = { disparity: 0, inconclusive: 0, no_material_disparity: 0 };
  for (const f of findings) out[f.status] += 1;
  return out;
}

export function reportFilename(audit: Pick<OutcomeAudit, "provenance">, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const hash = audit.provenance?.sha256?.slice(0, 8) ?? "report";
  return `bias0-assurance-${day}-${hash}.html`;
}

/**
 * A starter decision log: the columns BIAS-0 recognises, with three example rows.
 * `model_version` is optional but lets the audit link drift to a release.
 */
export const TEMPLATE_COLUMNS = [
  "decision_id",
  "decision_date",
  "decision",
  "gender",
  "age_band",
  "region",
  "model_score",
  "outcome",
  "model_version",
] as const;

export function decisionLogTemplate(): string {
  const rows = [
    ["D-0001", "2026-01-04", "approved", "female", "26-35", "urban", "0.81", "yes", "v1.0"],
    ["D-0002", "2026-01-04", "declined", "male", "18-25", "rural", "0.32", "no", "v1.0"],
    ["D-0003", "2026-02-11", "approved", "male", "36-50", "metro", "0.67", "", "v1.1"],
  ];
  return [TEMPLATE_COLUMNS.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

export interface ReproduceCheck {
  name: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

export interface ReproduceResult {
  sha256_expected: string | null;
  sha256_actual: string;
  sha256_ok: boolean;
  reproduced: boolean;
  verified: boolean;
  checks: ReproduceCheck[];
  n_checks: number;
  n_ok: number;
  summary: string;
  filename?: string;
  report_filename?: string;
}

export interface PairedColumns {
  pair_col: string;
  variant_col: string;
  decision_col: string;
  score_col: string;
  reference: string;
}

export interface PairedResult {
  schema: string;
  mapping: { pair_col: string; variant_col: string; decision_col: string; score_col: string | null };
  reference: string;
  other: string;
  n_pairs: number;
  n_pairs_dropped: number;
  table: { both_selected: number; only_reference: number; only_other: number; neither: number };
  flip_rate: number | null;
  flip_rate_ci: [number, number] | null;
  selection_rate: Record<string, number>;
  rate_difference: number;
  rate_difference_ci: [number, number];
  mcnemar_p: number;
  favoured: string | null;
  score: { mean_difference: number; ci: [number, number]; n_pairs: number } | null;
  verdict: { status: VerdictStatus; label: string; reason: string };
  config: { n_boot: number; seed: number; margin: number; min_pairs: number };
  warnings: string[];
  provenance?: { filename: string; sha256: string; rows: number };
}

/** Guess the roles from the header: pair id, the two-valued signal, the decision, a score. */
export function guessPairedColumns(header: string[], rows: string[][]): PairedColumns {
  const lower = header.map((h) => h.toLowerCase());
  const distinct = (i: number) => new Set(rows.map((r) => r[i]).filter((v) => v !== undefined && v !== "")).size;
  const find = (pred: (h: string, i: number) => boolean) => {
    const i = lower.findIndex(pred);
    return i >= 0 ? header[i] : "";
  };
  const pair = find((h) => h.includes("pair"));
  const decision = find((h, i) => /(shortlist|decision|selected|approved|hired|advance)/.test(h) && distinct(i) === 2);
  const score = find((h) => /(score|prob)/.test(h));
  const variant = find((h, i) => header[i] !== pair && header[i] !== decision && distinct(i) === 2);
  return { pair_col: pair, variant_col: variant, decision_col: decision, score_col: score, reference: "" };
}

