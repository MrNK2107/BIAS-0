import { test, expect } from '@playwright/test';

// Mode B, offline: the paired-probe sample from the sidebar to the verdict and the 2x2 table.
// Needs a DEMO_MODE API (API_PORT / VITE_PORT, see playwright.config.ts).

test('paired test: LLM-screener sample shows differential treatment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/assurance');
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
  }
  await page.locator('.workflow-rail-item', { hasText: 'Paired Test' }).click();
  await expect(page).toHaveURL(/\/paired$/);
  await page.getByRole('button', { name: /Run the LLM-screener sample/ }).click();

  await expect(page.locator('#pt-verdict-title')).toHaveText('Differential treatment evidenced', { timeout: 60_000 });
  await expect(page.getByText(/35 favoured male-coded and 2 favoured female-coded/)).toBeVisible();
  await expect(page.locator('.pt-2x2 td.hot')).toHaveText('35');
  await expect(page.getByText(/Mean score difference \+0\.05/)).toBeVisible();

  // Changing the reference re-runs with the direction reversed.
  await page.getByLabel('Reference version').fill('female-coded');
  await page.getByRole('button', { name: 'Analyse pairs' }).click();
  await expect(page.getByText(/female-coded minus male-coded/)).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

// The full loop: build a probe set in the UI, answer it with the CLI's offline mock screener, upload the results.
test('paired test: generate probes, run them against the mock screener, analyse the results', async ({ page }, testInfo) => {
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/paired');
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
    await page.goto('/paired');
  }
  const groups = page.locator('.pt-gen-group');
  await groups.nth(0).getByLabel('Label').fill('group-a');
  await groups.nth(0).getByLabel(/Names/).fill('Emily, Sarah, Anne');
  await groups.nth(1).getByLabel('Label').fill('group-b');
  await groups.nth(1).getByLabel(/Names/).fill('Greg, Todd, Neil');
  await page.getByLabel('Pairs').fill('150');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download probes' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^bias0-probes-[0-9a-f]{12}\.csv$/);
  await expect(page.getByText(/300 probes · probe set/)).toBeVisible();

  const probes = testInfo.outputPath('probes.csv');
  const results = testInfo.outputPath('results.csv');
  await download.saveAs(probes);
  execFileSync(process.env.PYTHON || 'python', ['-m', 'cli', 'probes', 'run', probes, '--endpoint', 'mock',
    '--mock-penalise', 'group-a', '--out', results], { cwd: path.resolve(process.cwd(), '../backend') });

  await page.getByLabel('Choose a paired-probe CSV').setInputFiles(results);
  await expect(page.locator('#pt-map-title')).toHaveText('results.csv');
  await page.getByRole('button', { name: 'Analyse pairs' }).click();
  await expect(page.locator('#pt-verdict-title')).toHaveText('Differential treatment evidenced', { timeout: 60_000 });
  await expect(page.getByText(/favoured group-b/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
