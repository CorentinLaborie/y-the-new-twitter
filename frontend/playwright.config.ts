import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3000);

// Chromium only in M0. Three sizes: desktop, tablet and mobile (rule R5).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Limits parallel Chrome instances (default: half the CPU cores) to keep the local machine responsive.
  workers: 2,
  forbidOnly: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The back-office is desktop only: its specs are not run here.
      name: 'tablet',
      testIgnore: '**/admin*.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      testIgnore: '**/admin*.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
    {
      // The settings at 325 px wide (plan L5, decision 14): only the settings specs run here.
      name: 'mobile-325',
      testMatch: ['**/settings-*.spec.ts', '**/bookmarks-325.spec.ts', '**/share-view-325.spec.ts', '**/messages-325.spec.ts'],
      use: { ...devices['Pixel 7'], viewport: { width: 325, height: 640 } },
    },
  ],
  webServer: [
    // Answers the session check of the protected pages, on the API port (see e2e/session-stub.mjs).
    { command: 'node e2e/session-stub.mjs', port: 8080, reuseExistingServer: true },
    {
      command: `npm run build && npm run start -- --port ${PORT}`,
      // The production build needs the API address: the tests answer it on the stub port.
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:8080' },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
