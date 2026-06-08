# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> E2E Audit Sequence Workflow
- Location: tests\e2e.spec.ts:4:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 120000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/workflow/step-3" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "Workflow navigation" [ref=e4]:
    - link "BIAS LAB home" [ref=e5] [cursor=pointer]:
      - /url: /
      - img "Logo" [ref=e6]
    - link "Open dashboard" [ref=e8] [cursor=pointer]:
      - /url: /dashboard
      - img [ref=e9]
    - navigation [ref=e15]:
      - 'link "Step 1: Upload" [ref=e16] [cursor=pointer]':
        - /url: /workflow/step-1
        - img [ref=e17]
      - 'link "Step 2: Configure" [ref=e20] [cursor=pointer]':
        - /url: /workflow/step-2
        - img [ref=e21]
      - 'link "Step 3: Data Audit"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 4: Model Bias"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 5: Explanations"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 6: Counterfactual"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 7: Stress Test"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 8: Sandbox"':
        - /url: /workflow/step-2
        - img
      - 'link "Step 9: Monitoring"':
        - /url: /workflow/step-2
        - img
  - generic [ref=e24]:
    - banner [ref=e25]:
      - button "Auto-Test Project 209375" [ref=e28] [cursor=pointer]:
        - img [ref=e29]
        - generic [ref=e34]: Auto-Test Project 209375
        - img [ref=e35]
      - generic [ref=e38]:
        - generic [ref=e39]: Configure
        - generic [ref=e40]: Step 2 of 9
      - button "Test User 209375" [ref=e43] [cursor=pointer]:
        - generic [ref=e44]: TU
        - generic [ref=e45]: Test User 209375
        - img [ref=e46]
    - main [ref=e48]:
      - generic [ref=e52]:
        - generic [ref=e53]:
          - img [ref=e55]
          - heading "Running Full Analysis" [level=2] [ref=e64]
          - paragraph [ref=e65]: Computing all fairness stages. This can take up to a minute for larger files.
        - generic [ref=e67]:
          - generic [ref=e68]: Status
          - generic [ref=e69]: Running
        - generic [ref=e72]:
          - generic [ref=e73]:
            - img [ref=e74]
            - generic [ref=e83]: Scanning dataset for representation gaps
          - generic [ref=e84]:
            - img [ref=e85]
            - generic [ref=e90]: Detecting proxy feature correlations
          - generic [ref=e91]:
            - img [ref=e92]
            - generic [ref=e97]: Training model and computing fairness metrics
          - generic [ref=e98]:
            - img [ref=e99]
            - generic [ref=e104]: Calculating SHAP values for explanations
          - generic [ref=e105]:
            - img [ref=e106]
            - generic [ref=e111]: Running counterfactual fairness tests
          - generic [ref=e112]:
            - img [ref=e113]
            - generic [ref=e118]: Probing model under stress perturbations
          - generic [ref=e119]:
            - img [ref=e120]
            - generic [ref=e125]: Generating fix recommendations
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | test('E2E Audit Sequence Workflow', async ({ page }) => {
  5   |   page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  6   |   // 1. Visit Hero Page
  7   |   await page.goto('/');
  8   |   await expect(page).toHaveTitle(/BIAS LAB/i);
  9   | 
  10  |   // Verify enter platform button is present
  11  |   const enterBtn = page.locator('button.cta-enter');
  12  |   await expect(enterBtn).toBeVisible();
  13  | 
  14  |   // Click ENTER PLATFORM to navigate to dashboard (will redirect to login if not authenticated)
  15  |   await enterBtn.click();
  16  |   await page.waitForURL('**/login');
  17  | 
  18  |   // Navigate to signup
  19  |   await page.click('text=Sign up');
  20  |   await page.waitForURL('**/signup');
  21  | 
  22  |   // Perform Signup with a random email
  23  |   const randomId = Math.floor(Math.random() * 1000000);
  24  |   const email = `testuser_${randomId}@example.com`;
  25  |   const name = `Test User ${randomId}`;
  26  |   const password = `Password123`;
  27  | 
  28  |   await page.fill('input[type="text"]', name);
  29  |   await page.fill('input[type="email"]', email);
  30  |   await page.fill('input[type="password"]', password);
  31  |   await page.click('button[type="submit"]');
  32  | 
  33  |   // Wait for redirect to dashboard
  34  |   await page.waitForURL('**/dashboard');
  35  |   
  36  |   // 2. Create a new project
  37  |   // Click project selector button
  38  |   await page.click('button.workflow-breadcrumb');
  39  |   
  40  |   // Click 'New Project' button
  41  |   await page.click('text=New Project');
  42  |   
  43  |   // Enter project details
  44  |   const projectName = `Auto-Test Project ${randomId}`;
  45  |   await page.fill('input[placeholder="Project Name"]', projectName);
  46  |   await page.click('button:has-text("Create")');
  47  | 
  48  |   // Wait for selector to update
  49  |   await expect(page.locator('button.workflow-breadcrumb')).toContainText(projectName);
  50  | 
  51  |   // 3. Ingestion Step (Step 1)
  52  |   // Navigate to Step 1
  53  |   await page.click('text=Start Audit Sequence');
  54  |   await page.waitForURL('**/workflow/step-1');
  55  | 
  56  |   // Upload the demo CSV file
  57  |   const fileChooserPromise = page.waitForEvent('filechooser');
  58  |   await page.click('text=Browse Files');
  59  |   const fileChooser = await fileChooserPromise;
  60  |   
  61  |   // Use absolute path to the demo file
  62  |   const filePath = path.resolve('../data/demo_loan.csv');
  63  |   await fileChooser.setFiles(filePath);
  64  | 
  65  |   // Verify CSV file is loaded
  66  |   await expect(page.locator('text=Loaded demo_loan.csv')).toBeVisible();
  67  | 
  68  |   // Navigate to Step 2
  69  |   await page.click('text=Next: Configure Attributes');
  70  |   await page.waitForURL('**/workflow/step-2');
  71  | 
  72  |   // 4. Configuration Step (Step 2)
  73  |   // Verify configuration options
  74  |   await expect(page.locator('text=Configuration')).toBeVisible();
  75  |   
  76  |   // Auto-suggest sensitive attributes
  77  |   await page.click('text=Auto-suggest sensitive attributes');
  78  |   
  79  |   // Click 'Start Full Analysis' button and wait for completion
  80  |   await page.click('text=Start Full Analysis', { timeout: 60000 });
  81  | 
  82  |   // 5. Verify Step 3: Data Audit Report
> 83  |   await page.waitForURL('**/workflow/step-3', { timeout: 180000 });
      |              ^ Error: page.waitForURL: Test timeout of 120000ms exceeded.
  84  |   await expect(page.locator('text=Data Audit')).toBeVisible();
  85  |   await expect(page.locator('text=Data Fairness Score')).toBeVisible();
  86  | 
  87  |   // Click Next
  88  |   await page.click('text=Next: Analyze Model Bias');
  89  |   
  90  |   // 6. Verify Step 4: Model Bias
  91  |   await page.waitForURL('**/workflow/step-4');
  92  |   await expect(page.locator('text=Model Bias')).toBeVisible();
  93  | 
  94  |   // Click Next
  95  |   await page.click('text=Next: Explore Explanations');
  96  | 
  97  |   // 7. Verify Step 5: Explanations
  98  |   await page.waitForURL('**/workflow/step-5');
  99  |   await expect(page.locator('text=Explanations')).toBeVisible();
  100 |   await expect(page.locator('text=Record Analysis')).toBeVisible();
  101 | 
  102 |   // Click Next
  103 |   await page.click('text=Next: Run Counterfactuals');
  104 | 
  105 |   // 8. Verify Step 6: Counterfactuals
  106 |   await page.waitForURL('**/workflow/step-6');
  107 |   await expect(page.locator('text=Counterfactual')).toBeVisible();
  108 | 
  109 |   // Click Next
  110 |   await page.click('text=Next: Stress Test');
  111 | 
  112 |   // 9. Verify Step 7: Stress Test
  113 |   await page.waitForURL('**/workflow/step-7');
  114 |   await expect(page.locator('text=Stress Test')).toBeVisible();
  115 | 
  116 |   // Click Next
  117 |   await page.click('text=Next: Strategy Sandbox');
  118 | 
  119 |   // 10. Verify Step 8: Sandbox
  120 |   await page.waitForURL('**/workflow/step-8');
  121 |   await expect(page.locator('text=Sandbox')).toBeVisible();
  122 | 
  123 |   // Click Next
  124 |   await page.click('text=Next: Continuous Monitoring');
  125 | 
  126 |   // 11. Verify Step 9: Monitoring
  127 |   await page.waitForURL('**/workflow/step-9');
  128 |   await expect(page.locator('text=Continuous Monitoring')).toBeVisible();
  129 | });
  130 | 
```