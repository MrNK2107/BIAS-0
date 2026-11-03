import { test, expect } from '@playwright/test';

// Outcome audit end to end: landing CTA -> sample log -> verdict, drift, framework
// mapping -> downloaded report carries the input hash -> audit appears in the
// hash-chained history. Needs a DEMO_MODE API (see playwright.config.ts for
// API_PORT / VITE_PORT). No model training, so it takes seconds.

test('sample outcome audit: verdict, drift, report and ledger', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fairness evidence');
  await page.getByRole('link', { name: /Run the sample audit/ }).first().click();
  await page.waitForURL(/\/(login|assurance)/);
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
    await page.goto('/assurance?sample=1');
  }

  await expect(page.locator('#verdict-title')).toHaveText('Disparity evidenced', { timeout: 120_000 });
  await expect(page.getByLabel('Grade E').first()).toBeVisible();
  // small-group guard and unknown-category handling are surfaced
  await expect(page.getByText(/other \(n=25\)/)).toBeVisible();
  await expect(page.getByText(/431 decision\(s\) with an unknown category/)).toBeVisible();
  // drift: region_tier breaches after the model update
  await expect(page.locator('.az-drift-card', { hasText: 'region_tier' }).getByText('breach since 2026-05')).toBeVisible();
  // framework mapping never claims human oversight
  const art14 = page.locator('tr', { hasText: 'Human oversight measures' });
  await expect(art14.getByText('Not evidenced')).toBeVisible();

  // mitigation trade-off: holdout curve with the disparate-treatment caveat
  const tradeoff = page.locator('section', { has: page.locator('#tradeoff-title') });
  await expect(tradeoff.getByText(/lifts the impact ratio|already gives an impact ratio|not a thresholding problem/)).toBeVisible({ timeout: 30_000 });
  await expect(tradeoff.getByText(/disparate treatment/)).toBeVisible();

  const receipt = page.getByText(/ledger entry #\d+/);
  await expect(receipt).toBeVisible();

  // Other specs share the demo user's ledger, so count only this input's entries.
  type Entry = { input: { sha256: string } };
  const before = (await (await page.request.get('/api/assurance/history')).json()).entries as Entry[];
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download report/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bias0-assurance-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.html$/);
  const html = await (await file.createReadStream())!.toArray();
  const body = Buffer.concat(html).toString('utf8');
  const sample = await page.request.get('/api/assurance/sample');
  const crypto = await import('crypto');
  const sha = crypto.createHash('sha256').update(await sample.body()).digest('hex');
  expect(body).toContain(sha);
  expect(body).toContain('Regulatory mapping');

  // History: the run is recorded once (rendering the report does not add an entry)
  const history = page.locator('section', { has: page.locator('#history-title') });
  await expect(history.getByText(/Chain verified/)).toBeVisible();
  const h = await (await page.request.get('/api/assurance/history')).json();
  expect(h.chain.ok).toBe(true);
  const mine = (entries: Entry[]) => entries.filter((e) => e.input.sha256 === sha).length;
  expect(mine(h.entries)).toBeGreaterThan(0);
  expect(mine(h.entries)).toBe(mine(before));

  expect(errors).toEqual([]);
});
