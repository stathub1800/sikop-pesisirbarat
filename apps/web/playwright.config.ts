/**
 * Uji ujung-ke-ujung (E2E). Membutuhkan:
 *   1. API lokal:  npm run dev:api   (wrangler dev, D1 lokal sudah di-migrate dan di-seed)
 *   2. Situs:      npm run dev:web   (Vite, port 5173)
 * Browser memakai Chrome terpasang bila CHROME_PATH diatur, selain itu Chromium Playwright.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.SIKOP_URL ?? 'http://localhost:5173',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }
      : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'ponsel', use: { ...devices['Pixel 7'] }, testMatch: /publik\.spec/ },
  ],
});
