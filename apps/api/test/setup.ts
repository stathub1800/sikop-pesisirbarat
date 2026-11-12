import { applyD1Migrations, env } from 'cloudflare:test';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- bentuk deklarasi tipe yang diwajibkan @cloudflare/vitest-plugin
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
      TEST_SEED: string;
      TEST_SEED_LMS: string;
      TEST_SEED_LMS_CONTOH: string;
    }
  }
}

/** Setiap baris berkas seed adalah satu pernyataan (dijamin oleh scripts/build-*.mjs). */
async function jalankanSeed(sql: string): Promise<void> {
  const baris = sql
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('--') && !l.startsWith('PRAGMA'));
  for (let i = 0; i < baris.length; i += 100) {
    await env.DB.batch(baris.slice(i, i + 100).map((l) => env.DB.prepare(l)));
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
const ada = await env.DB.prepare('SELECT COUNT(*) AS n FROM sekolah').first<{ n: number }>();
if (!ada?.n) {
  await jalankanSeed(env.TEST_SEED);
  await jalankanSeed(env.TEST_SEED_LMS);
  await jalankanSeed(env.TEST_SEED_LMS_CONTOH);
}
