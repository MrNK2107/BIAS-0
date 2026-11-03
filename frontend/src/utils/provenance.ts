import type { Provenance, TargetBinarisation } from "../types";

const STORED_NAME = /^[0-9a-f]{32}_(.+)$/;

/**
 * Original and stored file names of the audited input. Runs recorded before
 * provenance 1.1.0 put the storage object ("<32 hex>_demo_loan.csv") in
 * `filename`; the original name is recovered by stripping that prefix.
 */
export function inputNames(input: Provenance["input"]): {
  original: string;
  stored: string | null;
} {
  if (input.stored_name !== undefined) {
    return { original: input.filename, stored: input.stored_name ?? null };
  }
  const m = STORED_NAME.exec(input.filename);
  return m ? { original: m[1], stored: input.filename } : { original: input.filename, stored: null };
}

/** Evidence-pack / report text for the positive class (provenance >= 1.2.0). */
export function positiveLabelText(
  pl: Provenance["config"]["positive_label"] | undefined,
): string {
  if (pl === undefined) return "not recorded (run predates provenance 1.2.0)";
  if (pl === null || pl.value === null || pl.value === undefined) {
    return "none (median threshold of a numeric target)";
  }
  return `${String(pl.value)} (${pl.source === "user" ? "chosen by the user" : "inferred"})`;
}

/** Report / evidence-pack text for how the target became binary (provenance >= 1.3.0). */
export function targetEncodingText(tb: TargetBinarisation | null | undefined): string {
  if (tb === undefined) return "not recorded (run predates provenance 1.3.0)";
  if (tb === null || tb.method === "two_class") return "two classes";
  return tb.note ?? tb.method;
}

/** Report / evidence-pack text for the NYC LL144 rate type (provenance >= 1.4.0). */
export function ll144RateTypeText(rt: Provenance["config"]["ll144_rate_type"] | undefined): string {
  if (rt === undefined) return "not recorded (run predates provenance 1.4.0)";
  if (rt === null) return "not recorded";
  const rule = rt.value === "scoring" ? "scoring rate, 6 RCNY 5-301(c)" : "selection rate, 6 RCNY 5-301(b)";
  return `${rule} (${rt.source === "project" ? "project setting" : "default"})`;
}
