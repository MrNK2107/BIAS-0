/**
 * Paired test: reading the head of a probe-results CSV and guessing its columns.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { guessPairedColumns, parseCsvHead } from "../src/utils/assurance";

// The shape `python -m cli probes run` writes: quoted multi-line resume text with commas inside.
const results = [
  "probe_id,pair_id,variant,first_name,resume_text,decision,score,error",
  'P-0001-B,P-0001,male-coded,Neil,"Name: Neil Walsh\nSkills: Lean, SAP",yes,0.61,',
  'P-0001-A,P-0001,female-coded,Emily,"Name: Emily Walsh\nSkills: Lean, SAP",no,0.44,',
  'P-0002-A,P-0002,female-coded,Anne,"say ""hi""",yes,0.7,',
  "P-0002-B,P-0002,male-coded,Greg,plain,yes,0.72,",
].join("\r\n");

test("quoted fields with commas, newlines and escaped quotes stay in one cell", () => {
  const { header, rows } = parseCsvHead(results);
  assert.equal(header.length, 8);
  assert.equal(rows.length, 4);
  assert.equal(rows[0][4], "Name: Neil Walsh\nSkills: Lean, SAP");
  assert.equal(rows[2][4], 'say "hi"');
  assert.deepEqual(rows[3], ["P-0002-B", "P-0002", "male-coded", "Greg", "plain", "yes", "0.72", ""]);
});

test("BIAS-0 probe results map to pair_id / variant / decision / score", () => {
  const { header, rows } = parseCsvHead(results);
  assert.deepEqual(guessPairedColumns(header, rows), {
    pair_col: "pair_id",
    variant_col: "variant",
    decision_col: "decision",
    score_col: "score",
    reference: "",
  });
});

test("the bundled sample still maps by heuristics", () => {
  const csv = "pair_id,role,name_signal,screen_score,shortlisted\nP-1,Sales lead,female-coded,0.4,no\nP-1,Sales lead,male-coded,0.6,yes\n";
  const { header, rows } = parseCsvHead(csv);
  const c = guessPairedColumns(header, rows);
  assert.equal(c.variant_col, "name_signal");
  assert.equal(c.decision_col, "shortlisted");
  assert.equal(c.score_col, "screen_score");
});

test("maxRows caps the rows read", () => {
  const csv = ["a,b", ...Array.from({ length: 50 }, (_, i) => `${i},x`)].join("\n");
  assert.equal(parseCsvHead(csv, 10).rows.length, 10);
});
