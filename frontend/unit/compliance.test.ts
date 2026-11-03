/**
 * Unit tests for the compliance page helpers (NYC LL144 impact ratios).
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeExcluded,
  formatCheckValue,
  ll144Payload,
  selectionRatesFromGroupPerformance,
} from "../src/utils/compliance";

test("selection rates come from each group's approval rate", () => {
  const rates = selectionRatesFromGroupPerformance({
    sex: {
      F: { approval_rate: 0.3, tpr: null, fpr: null, accuracy: 0.8 },
      M: { approval_rate: 0.6, tpr: 0.7, fpr: 0.1, accuracy: 0.9 },
    },
  });
  assert.deepEqual(rates, { sex: { F: 0.3, M: 0.6 } });
});

test("no group performance gives undefined, not an empty object", () => {
  assert.equal(selectionRatesFromGroupPerformance(undefined), undefined);
  assert.equal(selectionRatesFromGroupPerformance({}), undefined);
});

test("impact ratios are shown as ratios, gaps as percentages", () => {
  assert.equal(
    formatCheckValue({ check: "Lowest impact ratio ≥ 0.80 (heuristic)", value: 0.979 }),
    "0.979",
  );
  assert.equal(
    formatCheckValue({ check: "Demographic parity gap ≤ 20%", value: 0.123 }),
    "12.3%",
  );
  assert.equal(formatCheckValue({ check: "Fairness score ≥ 70", value: 82 }), "82");
  assert.equal(formatCheckValue({ check: "Independent audit", value: "No" }), "No");
});

test("excluded categories are described with count, share and rate", () => {
  const text = describeExcluded({
    category: "C",
    n: 10,
    share: 0.01,
    rate: 0.1,
  });
  assert.equal(text, "C (n = 10, 1.0% of the data, rate 10.0%)");
});

const perf = {
  sex: {
    F: { approval_rate: 0.3, tpr: null, fpr: null, accuracy: 0.8 },
    M: { approval_rate: 0.6, tpr: 0.7, fpr: 0.1, accuracy: 0.9 },
  },
};
const ll144 = {
  selection: { rate_type: "selection" as const, rates: { sex: { F: 0.3, M: 0.6 } }, counts: { sex: { F: 40, M: 60 } } },
  scoring: { rate_type: "scoring" as const, rates: { sex: { F: 0.42, M: 0.55 } }, counts: { sex: { F: 40, M: 60 } } },
};

test("LL144 payload uses scoring rates and counts when the output is a score", () => {
  assert.deepEqual(ll144Payload({ group_performance: perf, ll144 }, "scoring"), {
    rate_type: "scoring",
    group_selection_rates: { sex: { F: 0.42, M: 0.55 } },
    group_counts: { sex: { F: 40, M: 60 } },
  });
});

test("LL144 payload falls back to selection when no score is available", () => {
  const p = ll144Payload({ group_performance: perf, ll144: { ...ll144, scoring: null } }, "scoring");
  assert.equal(p.rate_type, "selection");
  assert.deepEqual(p.group_counts, { sex: { F: 40, M: 60 } });
});

test("LL144 payload for older runs uses group performance, without counts", () => {
  assert.deepEqual(ll144Payload({ group_performance: perf }, "selection"), {
    rate_type: "selection",
    group_selection_rates: { sex: { F: 0.3, M: 0.6 } },
    group_counts: undefined,
  });
});
