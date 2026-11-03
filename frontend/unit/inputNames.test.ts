/** Original vs stored upload name in provenance (schema 1.1.0, with fallback for older runs). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { inputNames } from "../src/utils/provenance";
import { evidenceCsvRows, buildEvidencePack } from "../src/utils/evidencePack";
import { renderProvenance } from "../src/utils/reportExport";
import type { PipelineFullResult, Provenance } from "../src/types";

const HEX = "0123456789abcdef0123456789abcdef";
const base = { sha256: "a".repeat(64), size_bytes: 3, n_rows: 2, n_columns: 1, columns: ["x"] };

function prov(input: Provenance["input"]): Provenance {
  return {
    schema_version: "1.1.0",
    generated_at: "2026-11-02T00:00:00",
    input,
    model: { used: "tuned_logreg", sha256: null },
    config: {
      sensitive_cols: ["g"], target_col: "y", domain: "general",
      metric_weights: {}, unified_score_weights: {}, statistical_rigour: {},
    },
    versions: { bias0: "0.4.0", metrics: {}, libraries: {} },
  };
}

test("1.1.0 records: filename is the original, stored_name kept separately", () => {
  assert.deepEqual(
    inputNames({ ...base, filename: "Q3 loans.csv", stored_name: `${HEX}_Q3 loans.csv` }),
    { original: "Q3 loans.csv", stored: `${HEX}_Q3 loans.csv` },
  );
  // direct upload through /pipeline/run-all: nothing stored
  assert.deepEqual(inputNames({ ...base, filename: "a.csv", stored_name: null }), { original: "a.csv", stored: null });
});

test("pre-1.1.0 records: the uuid prefix is stripped from the stored name", () => {
  assert.deepEqual(inputNames({ ...base, filename: `${HEX}_demo_loan.csv` }), {
    original: "demo_loan.csv",
    stored: `${HEX}_demo_loan.csv`,
  });
  assert.deepEqual(inputNames({ ...base, filename: "abc_demo.csv" }), { original: "abc_demo.csv", stored: null });
});

test("report and CSV show the original name and keep the stored name as its own field", () => {
  const p = prov({ ...base, filename: `${HEX}_demo_loan.csv` });
  const html = renderProvenance(p);
  assert.match(html, /<td[^>]*>demo_loan\.csv \(2 rows/);
  assert.match(html, /Stored as/);
  assert.ok(html.includes(`${HEX}_demo_loan.csv`));

  const pack = buildEvidencePack({ provenance: p } as PipelineFullResult, new Date("2026-11-02T00:00:00Z"));
  const rows = evidenceCsvRows(pack);
  assert.equal(rows.find((r) => r.metric === "input_filename")?.value, "demo_loan.csv");
  assert.equal(rows.find((r) => r.metric === "input_stored_name")?.value, `${HEX}_demo_loan.csv`);

  const direct = renderProvenance(prov({ ...base, filename: "a.csv", stored_name: null }));
  assert.doesNotMatch(direct, /Stored as/);
});
