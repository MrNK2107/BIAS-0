/** Report light theme: palette colours become CSS variables with dark and light values. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyReportTheme, generateAuditReport, REPORT_THEME_CSS } from "../src/utils/reportExport";
import type { PipelineFullResult } from "../src/types";

test("palette colours in style attributes, the stylesheet and SVG attributes become variables", () => {
  const html = applyReportTheme(
    `<html><head><style>body { background: #0C0B0A; color: #F3F2F1; } .x { border: 1px solid rgba(200,157,124,0.12) }</style></head>` +
      `<body><p style="color:#AFAAA6;background:#A24A4622;border:1px solid rgba(255,255,255,0.08)">a</p>` +
      `<svg><path d="M0 0" stroke="#78726D" fill="none"/><circle r="2" fill="#C89D7C"/><text fill="#123456">t</text></svg>` +
      `<div style="background:rgba(0,0,0,0.2)">b</div></body></html>`,
  );
  assert.ok(html.includes("body { background: var(--bg); color: var(--text); }"));
  assert.ok(html.includes("border: 1px solid rgb(var(--accent-rgb) / 0.12)"));
  assert.ok(html.includes('style="color:var(--muted);background:rgb(var(--red-rgb) / 0.13);border:1px solid rgb(var(--ink-rgb) / 0.08)"'));
  assert.ok(html.includes('<path d="M0 0" fill="none" style="stroke:var(--subtle)"/>'));
  assert.ok(html.includes('<circle r="2" style="fill:var(--accent)"/>'));
  assert.ok(html.includes('<text fill="#123456">t</text>'), "colours outside the palette are left alone");
  assert.ok(html.includes('style="background:var(--shade)"'));
});

test("full report: no dark palette hex left; light values only under the light selectors", () => {
  const html = generateAuditReport({
    fairness_score: 42,
    decision: "HIGH RISK",
    scores: { data_bias_score: 80 },
    data_audit: { under_represented_groups: ["x"] },
  } as unknown as PipelineFullResult);
  const body = html.replace(REPORT_THEME_CSS, "");
  for (const hex of ["#AFAAA6", "#C89D7C", "#78726D", "#A24A46", "#8FA89B", "#F3F2F1", "#0C0B0A"]) {
    assert.ok(!body.toUpperCase().includes(hex), `${hex} still hard-coded`);
  }
  assert.match(html, /:root\[data-theme="light"\] \{ color-scheme: light; --bg: #FBF9F6;/);
  assert.match(html, /prefers-color-scheme: light\) \{ :root:not\(\[data-theme="dark"\]\)/);
  assert.match(html, />Light \/ dark<\/button>/);
  assert.match(html, /\.header \.score \{[^}]*color: var\(--red\)/);
});
