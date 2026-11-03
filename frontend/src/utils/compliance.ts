import type { GroupMetricValue, ModelBiasResult } from "../types";

/**
 * Per-attribute selection rates for the NYC LL144 impact-ratio table
 * (6 RCNY 5-301: selection rate per category, impact ratio = rate / highest rate).
 */
export function selectionRatesFromGroupPerformance(
  groupPerformance: Record<string, Record<string, GroupMetricValue>> | undefined,
): Record<string, Record<string, number>> | undefined {
  if (!groupPerformance) return undefined;
  const out: Record<string, Record<string, number>> = {};
  for (const [attr, groups] of Object.entries(groupPerformance)) {
    const rates: Record<string, number> = {};
    for (const [group, stats] of Object.entries(groups ?? {})) {
      if (typeof stats?.approval_rate === "number") rates[group] = stats.approval_rate;
    }
    if (Object.keys(rates).length) out[attr] = rates;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Impact ratios are unitless ratios; gaps in [0, 1] are shown as percentages. */
export function formatCheckValue(check: { check: string; value: number | string }): string {
  const { value } = check;
  if (typeof value !== "number") return String(value);
  if (/impact ratio/i.test(check.check)) return value.toFixed(3);
  return value > 1 ? String(value) : `${(value * 100).toFixed(1)}%`;
}

export interface ImpactRatioRow {
  category: string;
  rate: number | null;
  impact_ratio: number | null;
  /** number of individuals in the category, when counts were sent */
  n?: number;
}

export interface ExcludedCategory {
  category: string;
  n: number;
  share: number;
  rate: number | null;
}

/** One attribute of the NYC LL144 impact-ratio table (backend core.compliance.impact_ratios). */
export interface ImpactRatioTable {
  /** "selection" (6 RCNY 5-301(b)) or "scoring" (5-301(c)) */
  rate_type?: "selection" | "scoring";
  categories: ImpactRatioRow[];
  most_selected: string | null;
  min_impact_ratio: number | null;
  unknown_categories: string[];
  unknown_count?: number;
  /** categories under 2% left out by the auditor (6 RCNY 5-301(d)) */
  excluded_categories?: ExcludedCategory[];
  exclusion_justification?: string | null;
  exclusion_note?: string | null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** "C (n = 10, 1.0% of the data, rate 10.0%)": what 5-301(d) requires the summary to report. */
export function describeExcluded(ex: ExcludedCategory): string {
  const rate = ex.rate === null ? "rate n/a" : `rate ${pct(ex.rate)}`;
  return `${ex.category} (n = ${ex.n}, ${pct(ex.share)} of the data, ${rate})`;
}

/**
 * Rates, counts and rate type sent to /compliance/assess for the NYC LL144 table.
 * "scoring" (an AEDT that outputs a score, 6 RCNY 5-301(c)) is used only when the
 * run has scoring rates; otherwise selection rates (5-301(b)). Runs from before
 * the ll144 block fall back to group approval rates, without counts.
 */
export function ll144Payload(
  modelBias: Pick<ModelBiasResult, "group_performance" | "ll144"> | undefined,
  wanted: "selection" | "scoring",
): {
  rate_type: "selection" | "scoring";
  group_selection_rates: Record<string, Record<string, number>> | undefined;
  group_counts: Record<string, Record<string, number>> | undefined;
} {
  const block = modelBias?.ll144;
  const chosen = (wanted === "scoring" && block?.scoring) || block?.selection;
  if (chosen) {
    return {
      rate_type: chosen.rate_type,
      group_selection_rates: chosen.rates,
      group_counts: chosen.counts,
    };
  }
  return {
    rate_type: "selection",
    group_selection_rates: selectionRatesFromGroupPerformance(modelBias?.group_performance),
    group_counts: undefined,
  };
}
