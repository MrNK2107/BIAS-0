/**
 * Evidence pack export: a versioned, machine-readable JSON record of an audit
 * (provenance, config, metric versions, every gap with its CI, per-group rates
 * and calibration bins) plus a flat CSV of the same numbers for spreadsheets.
 *
 * Record-level data (SHAP explanations, counterfactual sample rows) is left out
 * on purpose: the pack is meant to be shared with reviewers.
 */

import type { ImpactRatioTable } from "./compliance";
import type {
  PipelineFullResult,
  Provenance,
  RigourAttribute,
  StatisticalRigour,
} from "../types";
import { inputNames, ll144RateTypeText, positiveLabelText, targetEncodingText } from "./provenance";
import { CANONICALIZATION, canonicalSha256, sha256Hex } from "./integrity";
import { generateAuditReport } from "./reportExport";
import { zipStore } from "./zip";

export { inputNames };

export const EVIDENCE_PACK_SCHEMA = "bias0.evidence-pack";
// 1.1.0: `integrity` self-hash; provenance.input.filename is the original upload name.
export const EVIDENCE_PACK_VERSION = "1.2.0";
export const MANIFEST_SCHEMA = "bias0.evidence-manifest";
export const MANIFEST_VERSION = "1.0.0";

export interface PackIntegrity {
  algorithm: "sha256";
  canonicalization: typeof CANONICALIZATION;
  scope: string;
  pack_sha256: string;
}

export interface EvidencePack {
  schema: typeof EVIDENCE_PACK_SCHEMA;
  schema_version: string;
  exported_at: string;
  provenance: Provenance | null;
  provenance_note?: string;
  summary: {
    fairness_score: number | null;
    decision: string | null;
    model_used: string | null;
    overall_accuracy: number | null;
    stage_scores: Record<string, number | undefined>;
  };
  fairness_metrics: Record<string, unknown> | null;
  statistical_rigour: StatisticalRigour | null;
  data_audit: {
    risk_level: string | null;
    max_gap: number | null;
    under_represented_groups: string[];
    group_stats: Record<string, unknown>;
  } | null;
  counterfactual: {
    sensitive_col: string;
    flip_rate: number;
    counterfactual_fairness_score: number;
  } | null;
  stress: {
    name: string;
    fairness_score: number;
    fairness_drop: number;
    fragile: boolean;
    statistically_significant: boolean | null;
    dpd_ci: unknown;
    baseline_dpd_ci: unknown;
  }[];
  recommendations: { fix_id: string; fix_type: string; issue: string }[];
  /** NYC LL144 impact-ratio table from the compliance assessment (null when not assessed) */
  nyc_ll144: Record<string, ImpactRatioTable> | null;
  /** set by sealEvidencePack; absent on packs built but not yet sealed */
  integrity?: PackIntegrity;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function buildEvidencePack(
  data: PipelineFullResult,
  exportedAt: Date = new Date(),
  nycLl144: Record<string, ImpactRatioTable> | null = null,
): EvidencePack {
  const mb = data.model_bias;
  const da = data.data_audit;
  const cf = data.counterfactual;
  return {
    schema: EVIDENCE_PACK_SCHEMA,
    schema_version: EVIDENCE_PACK_VERSION,
    exported_at: exportedAt.toISOString(),
    provenance: data.provenance ?? null,
    ...(data.provenance
      ? {}
      : {
          provenance_note:
            "This run predates provenance capture; re-run the audit to record the input hash and versions.",
        }),
    summary: {
      fairness_score: num(data.fairness_score),
      decision: data.decision ?? null,
      model_used: data.model_used ?? mb?.model_used ?? null,
      overall_accuracy: num(mb?.overall_accuracy),
      stage_scores: { ...(data.scores ?? {}) },
    },
    fairness_metrics: mb?.metrics ? { ...mb.metrics } : null,
    statistical_rigour: mb?.statistical_rigour ?? null,
    data_audit: da
      ? {
          risk_level: da.risk_level ?? null,
          max_gap: num(da.max_gap),
          under_represented_groups: da.under_represented_groups ?? [],
          group_stats: da.group_stats ?? {},
        }
      : null,
    counterfactual: cf
      ? {
          sensitive_col: cf.sensitive_col,
          flip_rate: cf.flip_rate,
          counterfactual_fairness_score: cf.counterfactual_fairness_score,
        }
      : null,
    stress: (data.stress?.scenarios ?? []).map((s) => ({
      name: s.name,
      fairness_score: s.fairness_score,
      fairness_drop: s.fairness_drop,
      fragile: s.fragile,
      statistically_significant: s.statistically_significant ?? null,
      dpd_ci: s.dpd_ci ?? null,
      baseline_dpd_ci: s.baseline_dpd_ci ?? null,
    })),
    recommendations: (data.recommendations ?? []).map((r) => ({
      fix_id: r.fix_id,
      fix_type: r.fix_type,
      issue: r.issue,
    })),
    nyc_ll144: nycLl144,
  };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "section",
  "attribute",
  "group",
  "metric",
  "value",
  "ci_lower",
  "ci_upper",
  "n",
  "reliable",
  "bin",
] as const;

type Cell = string | number | boolean | null | undefined;
type Row = Partial<Record<(typeof CSV_COLUMNS)[number], Cell>>;

/**
 * One CSV cell. Numbers are written as-is; text is quoted when needed, and text
 * starting with = + - @ (or a tab/CR) gets a leading apostrophe so a
 * spreadsheet does not run a group name such as "=HYPERLINK(...)" as a formula.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function attributeRows(
  section: string,
  attr: string,
  res: RigourAttribute,
): Row[] {
  const rows: Row[] = [];
  for (const [metric, g] of Object.entries(res.gaps)) {
    rows.push({
      section: `${section}_gap`,
      attribute: attr,
      metric,
      value: g.point,
      ci_lower: g.ci_lower,
      ci_upper: g.ci_upper,
      n: res.n_rows,
      reliable: !res.unreliable,
    });
  }
  for (const [group, g] of Object.entries(res.groups)) {
    const base = { section: `${section}_group`, attribute: attr, group, n: g.count, reliable: g.reliable };
    rows.push({
      ...base,
      metric: "selection_rate",
      value: g.selection_rate,
      ci_lower: g.selection_rate_ci[0],
      ci_upper: g.selection_rate_ci[1],
    });
    rows.push({ ...base, metric: "tpr", value: g.tpr });
    rows.push({ ...base, metric: "fpr", value: g.fpr });
    rows.push({ ...base, metric: "fnr", value: g.fnr });
  }
  const cal = res.calibration;
  if (cal) {
    const summaries = [["(overall)", cal.overall] as const, ...Object.entries(cal.by_group)];
    for (const [group, s] of summaries) {
      const base = { attribute: attr, group, n: s.n, reliable: s.reliable ?? true };
      for (const metric of ["ece", "mce", "brier"] as const) {
        rows.push({ ...base, section: "calibration", metric, value: s[metric] });
      }
      for (const b of s.bins) {
        const bin = `${b.lower.toFixed(2)}-${b.upper.toFixed(2)}`;
        rows.push({ ...base, section: "reliability_bin", metric: "mean_predicted", value: b.mean_predicted, n: b.count, bin });
        rows.push({ ...base, section: "reliability_bin", metric: "observed_rate", value: b.observed_rate, n: b.count, bin });
      }
    }
    rows.push({ section: "calibration", attribute: attr, metric: "ece_gap", value: cal.ece_gap });
  }
  return rows;
}

export function evidenceCsvRows(pack: EvidencePack): Row[] {
  const rows: Row[] = [
    { section: "meta", metric: "schema", value: `${pack.schema}@${pack.schema_version}` },
    { section: "meta", metric: "exported_at", value: pack.exported_at },
  ];
  const p = pack.provenance;
  if (p) {
    rows.push(
      { section: "provenance", metric: "input_filename", value: inputNames(p.input).original },
      { section: "provenance", metric: "input_stored_name", value: inputNames(p.input).stored },
      { section: "provenance", metric: "input_sha256", value: p.input.sha256 },
      { section: "provenance", metric: "input_rows", value: p.input.n_rows },
      { section: "provenance", metric: "model", value: p.model.used },
      { section: "provenance", metric: "positive_label", value: positiveLabelText(p.config.positive_label) },
      { section: "provenance", metric: "target_encoding", value: targetEncodingText(p.config.target_binarisation) },
      { section: "provenance", metric: "ll144_rate_type", value: ll144RateTypeText(p.config.ll144_rate_type) },
      { section: "provenance", metric: "bias0_version", value: p.versions.bias0 },
    );
    for (const [k, v] of Object.entries(p.versions.metrics)) {
      rows.push({ section: "metric_version", metric: k, value: v });
    }
    for (const [k, v] of Object.entries(p.config.statistical_rigour)) {
      rows.push({ section: "config", metric: k, value: v as Cell });
    }
  }
  rows.push({ section: "summary", metric: "fairness_score", value: pack.summary.fairness_score });
  rows.push({ section: "summary", metric: "decision", value: pack.summary.decision });
  for (const [k, v] of Object.entries(pack.summary.stage_scores)) {
    rows.push({ section: "summary", metric: k, value: v });
  }
  const r = pack.statistical_rigour;
  if (r) {
    for (const [attr, res] of Object.entries(r.per_attribute)) rows.push(...attributeRows("attribute", attr, res));
    for (const [attr, res] of Object.entries(r.intersectional)) rows.push(...attributeRows("intersection", attr, res));
  }
  for (const [attr, t] of Object.entries(pack.nyc_ll144 ?? {})) {
    const rateMetric = `${t.rate_type ?? "selection"}_rate`;
    for (const c of t.categories) {
      rows.push({ section: "nyc_ll144", attribute: attr, group: c.category, metric: rateMetric, value: c.rate, n: c.n });
      rows.push({ section: "nyc_ll144", attribute: attr, group: c.category, metric: "impact_ratio", value: c.impact_ratio, n: c.n });
    }
    if (t.unknown_count) {
      rows.push({ section: "nyc_ll144", attribute: attr, metric: "unknown_count", value: t.unknown_count });
    }
    for (const ex of t.excluded_categories ?? []) {
      rows.push({ section: "nyc_ll144_excluded", attribute: attr, group: ex.category, metric: rateMetric, value: ex.rate, n: ex.n });
      rows.push({ section: "nyc_ll144_excluded", attribute: attr, group: ex.category, metric: "share", value: ex.share, n: ex.n });
    }
    if (t.excluded_categories?.length) {
      rows.push({ section: "nyc_ll144_excluded", attribute: attr, metric: "justification", value: t.exclusion_justification ?? "(missing)" });
    }
  }
  for (const s of pack.stress) {
    const ci = s.dpd_ci as { point?: number; ci_lower?: number | null; ci_upper?: number | null } | null;
    rows.push({
      section: "stress",
      group: s.name,
      metric: "fairness_score",
      value: s.fairness_score,
    });
    if (ci) {
      rows.push({
        section: "stress",
        group: s.name,
        metric: "demographic_parity_difference",
        value: ci.point,
        ci_lower: ci.ci_lower,
        ci_upper: ci.ci_upper,
      });
    }
  }
  return rows;
}

export function evidenceCsv(pack: EvidencePack): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of evidenceCsvRows(pack)) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function stem(pack: EvidencePack): string {
  const hash = pack.provenance?.input.sha256.slice(0, 8);
  return `bias0-evidence-${pack.exported_at.slice(0, 10)}${hash ? `-${hash}` : ""}`;
}

// ── Integrity ───────────────────────────────────────────────────────────────

/** The pack as it reads back from its JSON file (undefined members dropped). */
function asWritten<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Add `integrity.pack_sha256`: SHA-256 of the RFC 8785 canonical JSON of the
 * pack without its `integrity` member. Check it with
 * `python -m core.evidence_integrity <file>` or POST /api/evidence/verify.
 */
export async function sealEvidencePack(pack: EvidencePack): Promise<EvidencePack> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { integrity: _old, ...body } = pack;
  const clean = asWritten(body) as EvidencePack;
  return {
    ...clean,
    integrity: {
      algorithm: "sha256",
      canonicalization: CANONICALIZATION,
      scope: "the whole pack with the integrity member removed",
      pack_sha256: await canonicalSha256(clean),
    },
  };
}

export const BUNDLE_FILES = {
  pack: "evidence-pack.json",
  csv: "evidence.csv",
  report: "report.html",
  manifest: "manifest.json",
} as const;

export interface ManifestArtifact {
  path: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
}

export interface EvidenceManifest {
  schema: typeof MANIFEST_SCHEMA;
  schema_version: string;
  created_at: string;
  hash_algorithm: "sha256";
  canonicalization: typeof CANONICALIZATION;
  artifacts: ManifestArtifact[];
  pack_schema: string;
  pack_sha256: string;
  input_filename: string | null;
  input_sha256: string | null;
  signature: null;
  signature_note: string;
  verify: string;
  manifest_sha256: string;
}

export interface EvidenceBundle {
  name: string;
  pack: EvidencePack;
  manifest: EvidenceManifest;
  files: Record<string, Uint8Array>;
  zip: Uint8Array;
}

const enc = new TextEncoder();

/**
 * Evidence bundle: pack JSON, CSV and HTML report plus a manifest listing the
 * SHA-256 of each file's exact bytes and the pack's canonical hash, zipped.
 */
export async function buildEvidenceBundle(
  data: PipelineFullResult,
  opts: {
    exportedAt?: Date;
    narrative?: Record<string, unknown>;
    nycLl144?: Record<string, ImpactRatioTable> | null;
  } = {},
): Promise<EvidenceBundle> {
  const exportedAt = opts.exportedAt ?? new Date();
  const pack = await sealEvidencePack(buildEvidencePack(data, exportedAt, opts.nycLl144 ?? null));
  const files: Record<string, Uint8Array> = {
    [BUNDLE_FILES.pack]: enc.encode(JSON.stringify(pack, null, 2) + "\n"),
    [BUNDLE_FILES.csv]: enc.encode("\uFEFF" + evidenceCsv(pack)),
    [BUNDLE_FILES.report]: enc.encode(generateAuditReport(data, opts.narrative, opts.nycLl144 ?? null)),
  };
  const media: Record<string, string> = {
    [BUNDLE_FILES.pack]: "application/json",
    [BUNDLE_FILES.csv]: "text/csv; charset=utf-8",
    [BUNDLE_FILES.report]: "text/html; charset=utf-8",
  };
  const artifacts: ManifestArtifact[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    artifacts.push({ path, media_type: media[path], size_bytes: bytes.length, sha256: await sha256Hex(bytes) });
  }
  const body: Omit<EvidenceManifest, "manifest_sha256"> = {
    schema: MANIFEST_SCHEMA,
    schema_version: MANIFEST_VERSION,
    created_at: pack.exported_at,
    hash_algorithm: "sha256",
    canonicalization: CANONICALIZATION,
    artifacts,
    pack_schema: `${pack.schema}@${pack.schema_version}`,
    pack_sha256: pack.integrity!.pack_sha256,
    input_filename: pack.provenance ? inputNames(pack.provenance.input).original : null,
    input_sha256: pack.provenance?.input.sha256 ?? null,
    signature: null,
    signature_note:
      "Unsigned. The hashes detect changes made after export, not who made the bundle. Sign manifest.json with your own key to bind it to an issuer (docs/evidence-pack.md).",
    verify: "python -m core.evidence_integrity <this .zip>  (run in backend/), or POST /api/evidence/verify",
  };
  const manifest: EvidenceManifest = { ...body, manifest_sha256: await canonicalSha256(body) };
  files[BUNDLE_FILES.manifest] = enc.encode(JSON.stringify(manifest, null, 2) + "\n");
  const zip = zipStore(
    Object.entries(files).map(([path, bytes]) => ({ path, data: bytes })),
    exportedAt,
  );
  return { name: `${stem(pack)}.zip`, pack, manifest, files, zip };
}

// ── Download helpers ────────────────────────────────────────────────────────

function download(content: string | Uint8Array, type: string, filename: string): void {
  const blob = new Blob([content as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadEvidencePack(data: PipelineFullResult): Promise<void> {
  const pack = await sealEvidencePack(buildEvidencePack(data));
  download(JSON.stringify(pack, null, 2) + "\n", "application/json", `${stem(pack)}.json`);
}

export function downloadEvidenceCsv(data: PipelineFullResult): void {
  const pack = buildEvidencePack(data);
  // BOM so Excel opens UTF-8 group names correctly.
  download("\uFEFF" + evidenceCsv(pack), "text/csv;charset=utf-8", `${stem(pack)}.csv`);
}

export async function downloadEvidenceBundle(
  data: PipelineFullResult,
  narrative?: Record<string, unknown>,
  nycLl144?: Record<string, ImpactRatioTable> | null,
): Promise<void> {
  const bundle = await buildEvidenceBundle(data, { narrative, nycLl144 });
  download(bundle.zip, "application/zip", bundle.name);
}
