import { test, expect } from '@playwright/test';

// The 30-second path for a visitor with no data: empty audit page -> hiring
// sample card -> verdict, action plan, drift linked to the screener release.
// Needs a DEMO_MODE API (API_PORT / VITE_PORT, see playwright.config.ts).

test('hiring sample: action plan and drift linked to the screener release', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/assurance');
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
    await page.goto('/assurance');
  }
  await expect(page.getByRole('heading', { name: 'Run a bundled audit' })).toBeVisible();
  await expect(page.locator('.az-sample')).toHaveCount(2);
  await page.getByRole('button', { name: 'Run the hiring sample audit' }).click();

  await expect(page.locator('#verdict-title')).toHaveText('Disparity evidenced', { timeout: 120_000 });
  // The sample gallery gives way to the result.
  await expect(page.locator('.az-sample')).toHaveCount(0);

  const plan = page.locator('section', { has: page.locator('#plan-title') });
  await expect(plan.getByRole('heading', { name: /Act now/ })).toBeVisible();
  await expect(plan.getByText('Review the screener_version change to s1.5')).toBeVisible();
  await expect(plan.getByText(/sex 0\.96 on s1\.4 versus 0\.56 on s1\.5/)).toBeVisible();
  await expect(plan.getByText('Add an outcome column')).toBeVisible();
  await expect(plan.getByText('Do not rank the small groups')).toBeVisible();

  const sexDrift = page.locator('.az-drift-card', { hasText: 'sex' }).first();
  await expect(sexDrift.locator('.az-change')).toContainText('screener_version');
  await expect(sexDrift.locator('.az-change')).toContainText('s1.4 → s1.5 in 2026-07');
  await expect(page.getByText(/No outcome column: error-rate fairness/)).toBeVisible();

  // The downloaded report opens with the same plan.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download report/ }).click();
  const body = Buffer.concat(await (await (await download).createReadStream())!.toArray()).toString('utf8');
  expect(body).toContain("What to do next");
  expect(body).toContain('screener_version → s1.5');
  expect(body.indexOf('What to do next')).toBeLessThan(body.indexOf('1. Key findings'));

  // The LL144 public summary opens in a new tab with the 5-303 facts and the intersection.
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /LL144 summary/ }).click();
  const summary = await popup;
  await expect(summary.getByRole('heading', { level: 1 })).toHaveText('TalentLens resume screener (s1.x)', { timeout: 60_000 });
  await expect(summary.getByText('Number of applicants assessed')).toBeVisible();
  await expect(summary.getByText(/Intersectional categories: sex × race_ethnicity/)).toBeVisible();
  await summary.close();

  // An auditor reproduces the report from the sample CSV.
  const csv = Buffer.from(await (await page.request.get('/api/assurance/sample?name=hiring')).body());
  const repro = page.locator('section', { has: page.locator('#repro-title') });
  await repro.getByLabel('Choose a BIAS-0 report').setInputFiles({ name: 'report.html', mimeType: 'text/html', buffer: Buffer.from(body) });
  await repro.getByLabel('Choose the decision log for the report').setInputFiles({ name: 'screen.csv', mimeType: 'text/csv', buffer: csv });
  await repro.getByRole('button', { name: 'Reproduce' }).click();
  await expect(repro.getByText(/^Reproduced\. The file matches the report's SHA-256/)).toBeVisible({ timeout: 60_000 });
  await expect(repro.getByText('differs')).toHaveCount(0);

  // The same report against an edited log is caught.
  const edited = Buffer.from(csv.toString('utf8').replace(/,yes\n/, ',no\n'));
  await repro.getByLabel('Choose the decision log for the report').setInputFiles({ name: 'screen-edited.csv', mimeType: 'text/csv', buffer: edited });
  await repro.getByRole('button', { name: 'Reproduce' }).click();
  await expect(repro.getByText(/SHA-256 differs/)).toBeVisible({ timeout: 60_000 });

  expect(errors).toEqual([]);
});
