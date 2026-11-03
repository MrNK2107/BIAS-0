// `npm run fixture:evidence` rebuilds backend/tests/fixtures/evidence_bundle_js.zip with the browser code
// (buildEvidenceBundle) so the Python verifier is tested on real browser output.
import { writeFileSync } from "node:fs";
import { buildEvidenceBundle } from "../src/utils/evidencePack";
import type { PipelineFullResult } from "../src/types";

const data = {
  fairness_score: 72.4,
  decision: "LOW RISK",
  model_used: "tuned_logreg",
  scores: { data_bias_score: 80.25, model_bias_score: 70 },
  provenance: {
    schema_version: "1.1.0",
    generated_at: "2026-11-02T00:00:00",
    input: {
      filename: "Q3 loans (final).csv",
      stored_name: "0123456789abcdef0123456789abcdef_Q3 loans (final).csv",
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      size_bytes: 3, n_rows: 1000, n_columns: 2, columns: ["gender", "approved"],
    },
    model: { used: "tuned_logreg", sha256: null },
    config: {
      sensitive_cols: ["gender"], target_col: "approved", domain: "loan",
      metric_weights: { dpd: 0.5, eod: 0.5 }, unified_score_weights: { model_bias_score: 0.25 },
      statistical_rigour: { n_boot: 1000, seed: 42, ci_level: 0.95, min_group_size: 30 },
    },
    versions: { bias0: "0.4.0", metrics: { bootstrap_ci: "1.0.0" }, libraries: { numpy: "2.5.4", shap: null } },
  },
  model_bias: {
    fairness_score: 70, risk_level: "Yellow", overall_accuracy: 0.81,
    metrics: { demographic_parity_difference: 0.18, "dpd_é": 1e-7 },
    group_performance: {}, model_used: "tuned_logreg",
  },
} as unknown as PipelineFullResult;

const b = await buildEvidenceBundle(data, { exportedAt: new Date("2026-11-02T00:00:00Z") });
writeFileSync(process.argv[2], b.zip);
console.log(b.name, b.zip.length, b.manifest.manifest_sha256, b.pack.integrity?.pack_sha256);
