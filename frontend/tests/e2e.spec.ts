import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// SCREENSHOTS=1 saves each result step to docs/screenshots/ (used for the README).
async function shot(page: Page, name: string) {
  if (!process.env.SCREENSHOTS) return;
  await page.waitForTimeout(1500); // let charts finish animating
  await page.screenshot({ path: path.resolve('../docs/screenshots', `step-${name}.png`), fullPage: false });
}

test('E2E Audit Sequence Workflow', async ({ page }) => {
  // Includes a full 5000-row analysis (model tuning + SHAP).
  test.setTimeout(480_000);
  // 1. Visit Hero Page
  await page.goto('/');
  await expect(page).toHaveTitle(/BIAS-0/i);

  // The landing page's nav links the model workbench (the dashboard).
  const enterBtn = page.getByRole('link', { name: 'Model workbench' }).first();
  await expect(enterBtn).toBeVisible();

  // Go to the dashboard (redirects to login if not authenticated)
  await enterBtn.click();
  // Demo mode (no Firebase) signs in a local demo user automatically.
  await page.waitForURL(/\/(login|dashboard)/);

  const randomId = Math.floor(Math.random() * 1000000);
  const demoButton = page.locator('text=Continue as demo user');
  const demoMode = page.url().includes('/login') && await demoButton
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (page.url().includes('/dashboard')) {
    // already signed in as the demo user
  } else if (demoMode) {
    // Firebase-less demo mode: no signup, a local demo user is used.
    await demoButton.click();
  } else {
    // Navigate to signup
    await page.click('text=Sign up');
    await page.waitForURL('**/signup');

    // Perform Signup with a random email
    const email = `testuser_${randomId}@example.com`;
    const name = `Test User ${randomId}`;
    const password = `Password123`;

    await page.fill('input[type="text"]', name);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
  }

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard');
  
  // 2. Create a new project
  // Click project selector button
  await page.click('button.workflow-breadcrumb');
  
  // Click 'New Project' button
  await page.click('text=New Project');
  
  // Enter project details
  const projectName = `Auto-Test Project ${randomId}`;
  await page.fill('input[placeholder="Project Name"]', projectName);
  await page.click('button:has-text("Create")');

  // Wait for selector to update
  await expect(page.locator('button.workflow-breadcrumb')).toContainText(projectName);

  // 3. Ingestion Step (Step 1)
  // Navigate to Step 1
  // Creating a project now jumps straight to Step 1; older builds stayed on the dashboard.
  await page.waitForTimeout(1000);
  if (!page.url().includes('/workflow/step-1')) {
    await page.click('text=Start Audit Sequence');
  }
  await page.waitForURL('**/workflow/step-1');

  // Upload the demo CSV file
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('text=Browse Files');
  const fileChooser = await fileChooserPromise;
  
  // Use absolute path to the demo file
  const filePath = path.resolve('../data/demo_loan.csv');
  await fileChooser.setFiles(filePath);

  // Verify CSV file is loaded
  await expect(page.locator('text=Loaded demo_loan.csv')).toBeVisible();

  // Navigate to Step 2
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.waitForURL('**/workflow/step-2');

  // 4. Configuration Step (Step 2)
  // Verify configuration options
  await expect(page.locator('text=Configuration')).toBeVisible();
  
  // Auto-suggest sensitive attributes
  await page.click('text=Auto-suggest sensitive attributes');
  
  // Click 'Start Full Analysis' button and wait for completion
  await page.getByRole('button', { name: 'Start Full Analysis' }).click({ timeout: 60000 });

  // 5. Verify Step 3: Data Audit Report
  // ~30-100 s on an idle machine; allow headroom for a loaded CI/dev box.
  await page.waitForURL('**/workflow/step-3', { timeout: 300000 });
  await expect(page.locator('text=Data Audit')).toBeVisible();
  await expect(page.locator('text=Data Fairness Score')).toBeVisible();
  await shot(page, '3-data-audit');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();
  
  // 6. Verify Step 4: Model Bias
  await page.waitForURL('**/workflow/step-4');
  await expect(page.locator('text=Model Bias')).toBeVisible();
  await shot(page, '4-model-bias');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();

  // 7. Verify Step 5: Explanations
  await page.waitForURL('**/workflow/step-5');
  await expect(page.locator('text=Explanations')).toBeVisible();
  await expect(page.locator('text=Record Analysis')).toBeVisible();
  await shot(page, '5-explanations');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();

  // 8. Verify Step 6: Counterfactuals
  await page.waitForURL('**/workflow/step-6');
  await expect(page.locator('text=Counterfactual')).toBeVisible();
  await shot(page, '6-counterfactual');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();

  // 9. Verify Step 7: Stress Test
  await page.waitForURL('**/workflow/step-7');
  await expect(page.locator('text=Stress Test')).toBeVisible();
  await shot(page, '7-stress-test');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();

  // 10. Verify Step 8: Sandbox
  await page.waitForURL('**/workflow/step-8');
  await expect(page.locator('text=Sandbox')).toBeVisible();
  await shot(page, '8-sandbox');

  // Click Next
  await page.getByRole('button', { name: /^Next/ }).click();

  // 11. Verify Step 9: Monitoring
  await page.waitForURL('**/workflow/step-9');
  await expect(page.locator('text=Continuous Monitoring')).toBeVisible();
  await shot(page, '9-monitoring');
});
