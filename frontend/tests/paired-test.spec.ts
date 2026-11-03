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
