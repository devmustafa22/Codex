import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// This suite uses the real browser SDK with a deterministic network substitute.
// It needs a separate server because Vite embeds these public settings at startup.
export default defineConfig({
  testDir: './tests',
  testMatch: ['cloud.spec.ts', 'admin.spec.ts'],
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 40_000,
  expect: { timeout: 7_000 },
  reporter: 'list',
  outputDir: 'test-results/cloud',
  use: {
    baseURL: 'http://127.0.0.1:5184',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Baghdad',
    launchOptions: {
      ...(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5184 --strictPort',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://madar-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_madar_test_public_key',
    },
  },
});
