import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const SEED = join(__dirname, '../../build/seed.sql');

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      if (!existsSync(SEED))
        throw new Error('build/seed.sql belum ada. Jalankan dahulu: npm run data:build');
      return {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            ENVIRONMENT: 'development',
            DEV_LOGIN: 'aktif',
            ALLOWED_ORIGINS: 'http://localhost:5173',
            SUPERADMIN_EMAILS: 'super@uji.id',
            GOOGLE_CLIENT_ID: 'uji-client-id.apps.googleusercontent.com',
            TURNSTILE_SITE_KEY: '',
            IP_SALT: 'garam-uji',
            TEST_MIGRATIONS: await readD1Migrations(join(__dirname, 'migrations')),
            TEST_SEED: readFileSync(SEED, 'utf8'),
            TEST_SEED_LMS: readFileSync(join(__dirname, 'test/fixtures/seed-lms-uji.sql'), 'utf8'),
            TEST_SEED_LMS_CONTOH: readFileSync(
              join(__dirname, 'test/fixtures/seed-lms-contoh.sql'),
              'utf8',
            ),
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
