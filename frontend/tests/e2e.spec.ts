import { test, expect } from '@playwright/test';
import path from 'path';

test('E2E Audit Sequence Workflow', async ({ page }) => {
  // 1. Visit Hero Page
  await page.goto('/');
  await expect(page).toHaveTitle(/BIAS LAB/i);

  // Verify enter platform button is present
  const enterBtn = page.locator('button.cta-enter');
  await expect(enterBtn).toBeVisible();

  // Click ENTER PLATFORM to navigate to dashboard (will redirect to login if not authenticated)
  await enterBtn.click();
  await page.waitForURL('**/login');

  // Navigate to signup
  await page.click('text=Sign up');
  await page.waitForURL('**/signup');

  // Perform Signup with a random email
  const randomId = Math.floor(Math.random() * 1000000);
  const email = `testuser_${randomId}@example.com`;
  const name = `Test User ${randomId}`;
  const password = `Password123`;

  await page.fill('input[type="text"]', name);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

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
  await page.click('text=Start Audit Sequence');
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
  await page.click('text=Next: Configure Attributes');
  await page.waitForURL('**/workflow/step-2');

  // 4. Configuration Step (Step 2)
  // Verify configuration options
  await expect(page.locator('text=Configuration')).toBeVisible();
  
  // Auto-suggest sensitive attributes
  await page.click('text=Auto-suggest sensitive attributes');
  
  // Click 'Start Full Analysis' button and wait for completion
  await page.click('text=Start Full Analysis', { timeout: 60000 });

  // 5. Verify Step 3: Data Audit Report
  await page.waitForURL('**/workflow/step-3', { timeout: 180000 });
  await expect(page.locator('text=Data Audit')).toBeVisible();
  await expect(page.locator('text=Data Fairness Score')).toBeVisible();

  // Click Next
  await page.click('text=Next: Analyze Model Bias');
  
  // 6. Verify Step 4: Model Bias
  await page.waitForURL('**/workflow/step-4');
  await expect(page.locator('text=Model Bias')).toBeVisible();

  // Click Next
  await page.click('text=Next: Explore Explanations');

  // 7. Verify Step 5: Explanations
  await page.waitForURL('**/workflow/step-5');
  await expect(page.locator('text=Explanations')).toBeVisible();
  await expect(page.locator('text=Record Analysis')).toBeVisible();

  // Click Next
  await page.click('text=Next: Run Counterfactuals');

  // 8. Verify Step 6: Counterfactuals
  await page.waitForURL('**/workflow/step-6');
  await expect(page.locator('text=Counterfactual')).toBeVisible();

  // Click Next
  await page.click('text=Next: Stress Test');

  // 9. Verify Step 7: Stress Test
  await page.waitForURL('**/workflow/step-7');
  await expect(page.locator('text=Stress Test')).toBeVisible();

  // Click Next
  await page.click('text=Next: Strategy Sandbox');

  // 10. Verify Step 8: Sandbox
  await page.waitForURL('**/workflow/step-8');
  await expect(page.locator('text=Sandbox')).toBeVisible();

  // Click Next
  await page.click('text=Next: Continuous Monitoring');

  // 11. Verify Step 9: Monitoring
  await page.waitForURL('**/workflow/step-9');
  await expect(page.locator('text=Continuous Monitoring')).toBeVisible();
});
