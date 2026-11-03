import { test, expect } from '@playwright/test';

// Regression test for the step-6 "Next does nothing" flake.
//
// React Router applies navigations inside startTransition. When the next step's
// lazy chunk is still downloading, React keeps rendering the old step and
// useLocation() keeps returning the old path, while window.location already
// shows the new URL. A Next click in that window used to be handled for the
// old step, so it navigated to the step we were already going to and the
// workflow never advanced. Here every step chunk is delayed, and Next is
// clicked as soon as the URL changes, so the race is hit on every step.
// No analysis run is needed: the project is unlocked through the API.
test('Next advances one step per click while step chunks are still loading', async ({ page }) => {
  test.setTimeout(120_000);

  await page.route(/\/src\/pages\/workflow\/Step[4-8]\w*\.tsx/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await page.goto('/dashboard');
  await page.waitForURL(/\/(login|dashboard)/);
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
    await page.waitForURL('**/dashboard');
  }

  const create = await page.request.post('/api/project/create', {
    multipart: { name: `Nav race ${Date.now()}` },
  });
  expect(create.ok()).toBeTruthy();
  const { project_id: projectId } = (await create.json()) as { project_id: string };
  const step = await page.request.patch(`/api/project/${projectId}/step`, {
    multipart: { step: '9' },
  });
  expect(step.ok()).toBeTruthy();

  await page.evaluate((id) => localStorage.setItem('active_project_id', id), projectId);
  // A reload resumes the project at its furthest step (9); then go back to 3 in-app.
  await page.goto('/workflow/step-9');
  await page.waitForURL('**/workflow/step-9');
  await expect(page.locator('.workflow-topbar-meta')).toHaveText('Step 9 of 9');
  await page.locator('a.workflow-rail-item[href="/workflow/step-3"]').click();
  await expect(page.locator('.workflow-topbar-meta')).toHaveText('Step 3 of 9');

  const next = page.locator('.workflow-nav-footer button.btn-primary');
  for (let n = 3; n < 9; n++) {
    await next.click();
    await page.waitForURL(`**/workflow/step-${n + 1}`, { timeout: 15_000 });
  }
  await expect(page.locator('.workflow-topbar-meta')).toHaveText('Step 9 of 9');
});
