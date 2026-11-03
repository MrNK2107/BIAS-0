/** NYC LL144 rate type: project setting text in provenance, report and CSV. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ll144RateTypeText } from "../src/utils/provenance";
import { renderProvenance } from "../src/utils/reportExport";
import type { Provenance } from "../src/types";

test("ll144RateTypeText describes the setting and its source", () => {
  assert.match(ll144RateTypeText(undefined), /not recorded.*1\.4\.0/);
  assert.match(ll144RateTypeText(null), /not recorded/);
  assert.equal(
    ll144RateTypeText({ value: "scoring", source: "project" }),
    "scoring rate, 6 RCNY 5-301(c) (project setting)",
  );
  assert.equal(
    ll144RateTypeText({ value: "selection", source: "default" }),
    "selection rate, 6 RCNY 5-301(b) (default)",
  );
});

test("report provenance shows the LL144 rate row", () => {
  const p = {
    input: { filename: "d.csv", stored_name: null, sha256: "ab", size_bytes: 1, n_rows: 1, n_columns: 1 },
    model: { used: "rf", sha256: null },
    config: {
      target_col: "y", sensitive_cols: ["g"], statistical_rigour: {},
      ll144_rate_type: { value: "scoring", source: "project" },
    },
    versions: { bias0: "0.4.0", metrics: {}, libraries: {} },
    generated_at: "now",
  } as unknown as Provenance;
  const html = renderProvenance(p);
  assert.match(html, /NYC LL144 rate/);
  assert.match(html, /scoring rate, 6 RCNY 5-301\(c\) \(project setting\)/);
});
