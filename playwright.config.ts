import { defineConfig, devices } from '@playwright/test';

const testUrl = process.env.CLARA_TEST_URL;

export default defineConfig({
  testDir: './tests/e2e',
  // Includes first-request Metro compilation on slower development machines.
  timeout: 180000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-report' }]],
  use: {
    baseURL: testUrl ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium', channel: 'chromium' },
    },
  ],
  webServer: testUrl
    ? undefined
    : {
        command: 'npm run web -- --port 8081',
        url: 'http://localhost:8081',
        reuseExistingServer: true,
        timeout: 180000,
      },
});
