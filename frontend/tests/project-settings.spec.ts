import { test, expect } from '@playwright/test';

// Project settings dialog: the NYC LL144 rate type is saved to the project
// (PATCH /project/{id}/settings, multipart) and shown as current on reopen.
// Needs a DEMO_MODE API (see playwright.config.ts for API_PORT / VITE_PORT).

test('LL144 rate type saves from the project settings dialog', async ({ page, request }) => {
  const name = `Resume screener ${Date.now().toString().slice(-6)}`;
  const created = await request.post('/api/project/create', { multipart: { name, domain: 'hiring' } });
  expect(created.ok()).toBeTruthy();
  const { project_id } = await created.json();

  await page.goto('/workflow/step-1');
  const gear = page.getByRole('button', { name: `Settings for ${name}` });
  if (!(await gear.count())) await page.locator('.workflow-topbar button.workflow-breadcrumb').click();
  await gear.scrollIntoViewIfNeeded();
  await gear.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('NYC Local Law 144 rate type');
  const save = dialog.getByRole('button', { name: 'Save settings' });
  await expect(save).toBeDisabled();
  await dialog.getByRole('radio', { name: /Scoring rate/ }).check();
  await save.click();
  await expect(dialog).toBeHidden();

  const list = await (await request.get('/api/project/list')).json();
  const projects: { id: string | number; ll144_rate_type?: string }[] = list.projects ?? list;
  expect(projects.find((p) => String(p.id) === String(project_id))?.ll144_rate_type).toBe('scoring');

  if (!(await gear.count())) await page.locator('.workflow-topbar button.workflow-breadcrumb').click();
  await gear.scrollIntoViewIfNeeded();
  await gear.click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: /Scoring rate/ })).toBeChecked();
  await expect(page.getByRole('dialog')).toContainText('Scoring rate (current)');
});
