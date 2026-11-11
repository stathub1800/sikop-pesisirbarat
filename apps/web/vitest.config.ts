import { defineConfig } from 'vitest/config';

// Uji unit frontend (jsdom). Uji browser sungguhan ada di tests/ dan dijalankan Playwright.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
