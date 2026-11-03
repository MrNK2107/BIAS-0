import { defineConfig, devices } from '@playwright/test';

const port = process.env.VITE_PORT || '5173';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-failure',
  },
  projects: [
    {
      name: 'chromium',
      // No GPU: headless runs on shared machines stay off the graphics driver.
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-gpu'], executablePath: process.env.PW_EXE || undefined },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI && !process.env.VITE_PORT,
    timeout: 120000,
  },
});
