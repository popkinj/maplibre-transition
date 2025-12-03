import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for MapLibre Transition E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173/maplibre-transition/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // WebGL support for MapLibre
    launchOptions: {
      args: ['--use-gl=egl'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Start the Vite dev server before running tests
  webServer: {
    command: 'npm run serve:examples',
    url: 'http://localhost:5173/maplibre-transition/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
