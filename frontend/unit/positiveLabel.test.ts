/**
 * Unit tests for the positive-class choice: which target values offer a
 * select, and how the evidence pack / report describe the choice.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { positiveLabelText, targetEncodingText } from "../src/utils/provenance";
import { binaryTargetValues, csvPreviewRows } from "../src/utils/positiveLabel";

test("a two-valued target offers its two values, sorted", () => {
  const rows = [{ y: "deny" }, { y: "approve" }, { y: "deny" }, { y: "" }, { y: null }];
  assert.deepEqual(binaryTargetValues(rows, "y"), ["approve", "deny"]);
});

test("one or more than two values offer no select", () => {
  assert.equal(binaryTargetValues([{ y: "a" }, { y: "a" }], "y"), null);
  assert.equal(binaryTargetValues([{ y: "a" }, { y: "b" }, { y: "c" }], "y"), null);
  assert.equal(binaryTargetValues([{ x: 1 }], "y"), null);
});

test("numeric values are offered as text", () => {
  assert.deepEqual(binaryTargetValues([{ y: 1 }, { y: 0 }], "y"), ["0", "1"]);
});

test("provenance text says whether the label was chosen or inferred", () => {
  assert.equal(positiveLabelText({ value: "deny", source: "user" }), "deny (chosen by the user)");
  assert.equal(positiveLabelText({ value: 1, source: "inferred" }), "1 (inferred)");
  assert.equal(positiveLabelText(undefined), "not recorded (run predates provenance 1.2.0)");
  assert.equal(positiveLabelText({ value: null, source: "inferred" }), "none (median threshold of a numeric target)");
});

test("CSV preview rows honour quoted commas", () => {
  const rows = csvPreviewRows('name,y\n"Doe, J",yes\nRoe,"no"\n');
  assert.deepEqual(rows, [{ name: "Doe, J", y: "yes" }, { name: "Roe", y: "no" }]);
  assert.deepEqual(binaryTargetValues(rows, "y"), ["no", "yes"]);
});

test("target encoding text names how the target became binary", () => {
  assert.equal(targetEncodingText(undefined), "not recorded (run predates provenance 1.3.0)");
  assert.equal(targetEncodingText({ method: "two_class", n_classes: 2, note: null }), "two classes");
  assert.equal(
    targetEncodingText({
      method: "median_threshold",
      n_classes: 40,
      threshold: 19.5,
      note: "Target has 40 numeric values; it was binarised at its median (19.5): values above the median count as the positive outcome.",
    }),
    "Target has 40 numeric values; it was binarised at its median (19.5): values above the median count as the positive outcome.",
  );
});
