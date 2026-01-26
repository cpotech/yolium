import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './src/tests/e2e/global-setup.ts',
  testDir: './src/tests/e2e',
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron tests must run serially
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],
  outputDir: 'src/tests/e2e-results',
});
