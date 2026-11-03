/** NYC LL144 impact-ratio table in the HTML audit report. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateAuditReport, renderLl144Section } from "../src/utils/reportExport";
import type { ImpactRatioTable } from "../src/utils/compliance";
import type { PipelineFullResult } from "../src/types";

const table: Record<string, ImpactRatioTable> = {
  sex: {
    rate_type: "scoring",
    categories: [
      { category: "F", rate: 0.4, impact_ratio: 0.8, n: 40 },
      { category: "M", rate: 0.5, impact_ratio: 1, n: 58 },
    ],
    most_selected: "M",
    min_impact_ratio: 0.8,
    unknown_categories: ["(missing)"],
    unknown_count: 3,
    excluded_categories: [{ category: "<X>", n: 1, share: 0.01, rate: 0.1 }],
    exclusion_justification: "Too few <applicants> for a stable rate",
  },
};

test("renderLl144Section: rates, ratios, unknowns, exclusion and notes", () => {
  const html = renderLl144Section(table);
  assert.match(html, /Scoring rate/);
  assert.match(html, /<td[^>]*>F<\/td>/);
  assert.match(html, /0\.800/);
  assert.match(html, /40\.0%/);
  assert.match(html, /Unknown category: 3 individuals/i);
  assert.match(html, /reporting only/i);
  assert.match(html, /no pass\/fail threshold/i);
  assert.match(html, /EEOC heuristic/);
  assert.match(html, /not an LL144 threshold/);
  // excluded category with justification, escaped
  assert.match(html, /&lt;X&gt; \(n = 1, 1\.0% of the data, rate 10\.0%\)/);
  assert.match(html, /Too few &lt;applicants&gt;/);
  assert.doesNotMatch(html, /<X>|<applicants>/);
  // accessible table: caption and header scopes
  assert.match(html, /<caption/);
  assert.match(html, /<th scope="col"/);
});

test("renderLl144Section: selection rate label and missing justification", () => {
  const t: ImpactRatioTable = {
    ...table.sex,
    rate_type: undefined,
    exclusion_justification: null,
  };
  const html = renderLl144Section({ race: t });
  assert.match(html, /Selection rate/);
  assert.match(html, /justification missing/i);
});

test("renderLl144Section: empty when not assessed", () => {
  assert.equal(renderLl144Section(null), "");
  assert.equal(renderLl144Section({}), "");
});

test("generateAuditReport includes the LL144 section only when given", () => {
  const data = { scores: {}, fairness_score: 70 } as unknown as PipelineFullResult;
  assert.doesNotMatch(generateAuditReport(data), /NYC Local Law 144/);
  const html = generateAuditReport(data, undefined, table);
  assert.match(html, /NYC Local Law 144/);
  assert.match(html, /EEOC heuristic/);
});
