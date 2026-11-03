// Headless product screenshots for the README (isolated Chromium; never a shared browser).
// Usage: BASE=http://localhost:18521 OUT=../docs/screenshots node scripts/screenshots.mjs
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:8000";
const out = process.env.OUT ?? "../docs/screenshots";

// PW_EXE: optional path to a Chromium/headless-shell binary when the Playwright browser cache is out of step.
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"], executablePath: process.env.PW_EXE || undefined });
const errors = [];
async function page(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}

const desk = await page({ width: 1440, height: 900 });
await desk.goto(`${base}/`, { waitUntil: "networkidle" });
await desk.evaluate(() => document.fonts.ready);
await desk.screenshot({ path: `${out}/landing-hero.png` });
await desk.screenshot({ path: `${out}/landing-full.png`, fullPage: true });

await desk.locator("#compare").scrollIntoViewIfNeeded();
await desk.locator("#compare").screenshot({ path: `${out}/landing-compare.png` });

await desk.goto(`${base}/assurance`, { waitUntil: "networkidle" });
await desk.waitForSelector(".az-sample");
await desk.waitForTimeout(400);
await desk.screenshot({ path: `${out}/assurance-samples.png` });

await desk.goto(`${base}/assurance?sample=1`, { waitUntil: "networkidle" });
await desk.waitForSelector("#verdict-title", { timeout: 120_000 });
await desk.waitForTimeout(800);
// Element shots: keep the sticky top bar and chat button out of the frame.
await desk.addStyleTag({ content: ".workflow-topbar{position:static!important} [aria-label='Open Fairness Assistant']{display:none!important}" });
await desk.evaluate(() => {
  const el = document.querySelector(".az-verdict");
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24);
});
await desk.screenshot({ path: `${out}/assurance-verdict.png` });
await desk.locator(".az-plan").screenshot({ path: `${out}/assurance-plan.png` });
await desk.locator("#drift-title").scrollIntoViewIfNeeded();
await desk.locator(".az-panel:has(#drift-title)").screenshot({ path: `${out}/assurance-drift.png` });
await desk.locator(".az-panel:has(#inter-title)").screenshot({ path: `${out}/assurance-intersections.png` });
await desk.locator(".az-panel:has(#impact-title)").screenshot({ path: `${out}/assurance-impact.png` });
await desk.locator(".az-panel:has(#fw-title)").screenshot({ path: `${out}/assurance-frameworks.png` });
await desk.waitForSelector("#tradeoff-title");
await desk.waitForFunction(() => !document.querySelector(".az-panel:has(#tradeoff-title) [role=status]"));
await desk.waitForTimeout(500);
await desk.locator(".az-panel:has(#tradeoff-title)").screenshot({ path: `${out}/assurance-tradeoff.png` });
await desk.locator(".az-panel:has(#history-title)").screenshot({ path: `${out}/assurance-history.png` });
await desk.screenshot({ path: `${out}/assurance-full.png`, fullPage: true });

// The hiring sample: drift linked to the screener release.
await desk.goto(`${base}/assurance?sample=hiring`, { waitUntil: "networkidle" });
await desk.waitForSelector("#verdict-title", { timeout: 120_000 });
await desk.waitForTimeout(800);
await desk.addStyleTag({ content: ".workflow-topbar{position:static!important} [aria-label='Open Fairness Assistant']{display:none!important}" });
await desk.locator(".az-plan").screenshot({ path: `${out}/hiring-plan.png` });
await desk.locator(".az-panel:has(#drift-title)").screenshot({ path: `${out}/hiring-drift.png` });

// Reproduce a report: the report the app would download, plus the sample CSV.
const csv = Buffer.from(await (await desk.request.get(`${base}/api/assurance/sample?name=hiring`)).body());
const report = await desk.request.post(`${base}/api/assurance/outcome-audit/report`, {
  multipart: {
    file: { name: "sample_hiring_screen.csv", mimeType: "text/csv", buffer: csv },
    decision_col: "shortlisted", group_cols: "sex,race_ethnicity", score_col: "screen_score", time_col: "applied_date",
  },
});
const repro = desk.locator(".az-repro");
await repro.getByLabel("Choose a BIAS-0 report").setInputFiles({ name: "bias0-report.html", mimeType: "text/html", buffer: Buffer.from(await report.body()) });
await repro.getByLabel("Choose the decision log for the report").setInputFiles({ name: "sample_hiring_screen.csv", mimeType: "text/csv", buffer: csv });
await repro.getByRole("button", { name: "Reproduce" }).click();
await repro.locator(".az-repro-result").waitFor({ timeout: 60_000 });
await repro.screenshot({ path: `${out}/assurance-reproduce.png` });

// The NYC LL144 public summary for the hiring sample.
const summary = await desk.request.post(`${base}/api/assurance/ll144-summary`, {
  multipart: {
    file: { name: "sample_hiring_screen.csv", mimeType: "text/csv", buffer: csv },
    decision_col: "shortlisted", group_cols: "sex,race_ethnicity", score_col: "screen_score", time_col: "applied_date",
    system_name: "TalentLens resume screener (s1.x)", organisation: "Example Staffing, New York (synthetic)",
  },
});
const paper = await (await browser.newContext({ viewport: { width: 1100, height: 1500 } })).newPage();
await paper.setContent(await summary.text(), { waitUntil: "networkidle" });
await paper.screenshot({ path: `${out}/ll144-summary.png` });

// Paired test (Mode B, offline): the LLM-screener sample.
await desk.goto(`${base}/paired?sample=1`, { waitUntil: "networkidle" });
await desk.waitForSelector("#pt-verdict-title", { timeout: 60_000 });
await desk.waitForTimeout(500);
await desk.addStyleTag({ content: ".workflow-topbar{position:static!important} [aria-label='Open Fairness Assistant']{display:none!important}" });
await desk.evaluate(() => {
  const el = document.querySelector(".pt-verdict");
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24);
});
await desk.screenshot({ path: `${out}/paired-test.png` });

// Paired test step 1: the probe generator with the send-them snippet open.
await desk.locator(".pt-send summary").click();
await desk.locator(".pt-gen").screenshot({ path: `${out}/paired-probes.png` });

const phone = await page({ width: 390, height: 844 });
await phone.goto(`${base}/`, { waitUntil: "networkidle" });
await phone.evaluate(() => document.fonts.ready);
await phone.screenshot({ path: `${out}/landing-mobile.png`, fullPage: true });
// Phones: the demo pill sits in the page flow, above a one-row top bar.
await phone.goto(`${base}/paired`, { waitUntil: "networkidle" });
await phone.screenshot({ path: `${out}/paired-mobile.png` });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

await browser.close();
console.log(JSON.stringify({ errors, mobileOverflowPx: overflow }));
