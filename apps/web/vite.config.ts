/**
 * Build multi-halaman (MPA) untuk Cloudflare Pages.
 * Header dan footer disisipkan saat build dari src/partials agar HTML statis lengkap (baik untuk
 * mesin pencari, R02) tetapi tetap satu sumber (mudah dipelihara).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ROOT = __dirname;
const SITUS = process.env.SIKOP_SITE_URL ?? 'https://sikop-pesisirbarat.pages.dev';

/** Semua index.html di bawah root (kecuali node_modules/dist/public) menjadi entri build. */
function cariHalaman(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const n of readdirSync(dir)) {
    if (
      [
        'node_modules',
        'dist',
        'public',
        'src',
        'functions',
        'tests',
        'test-results',
        'playwright-report',
      ].includes(n)
    )
      continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) cariHalaman(p, out);
    else if (n === 'index.html' || n === '404.html')
      out[relative(ROOT, p).replace(/\/?index\.html$/, '') || 'beranda'] = p;
  }
  return out;
}

const NAV = [
  { id: 'beranda', href: '/', label: 'Beranda' },
  // Dua menu utama: Peta Tematik (semua data visual, per tema) dan Ruang Belajar (LMS).
  // Data baru ditambahkan sebagai indikator bertema di Peta Tematik, bukan sebagai menu baru.
  { id: 'peta', href: '/peta/', label: 'Peta Tematik' },
  { id: 'belajar', href: '/belajar/', label: 'Ruang Belajar' },
  { id: 'layanan', href: '/layanan/', label: 'Layanan Data' },
];

/**
 * Server dev Vite tidak membaca public/_redirects (fitur Cloudflare Pages). Plugin ini menerapkan aturan
 * sederhana "asal tujuan kode" agar perilaku lokal dan CI sama dengan produksi.
 */
function alihkan(): Plugin {
  return {
    name: 'sikop-redirects',
    configureServer(server) {
      const aturan = readFileSync(resolve(__dirname, 'public/_redirects'), 'utf8')
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b && !b.startsWith('#'))
        .map((b) => b.split(/\s+/))
        .filter((b) => b.length >= 2 && !b[0]!.includes('*') && !b[0]!.includes(':'));
      server.middlewares.use((req, res, next) => {
        const [jalur, kueri] = (req.url ?? '').split('?');
        const cocok = aturan.find((a) => a[0] === jalur);
        if (!cocok) return next();
        res.statusCode = Number(cocok[2] ?? 302);
        res.setHeader('Location', cocok[1] + (kueri ? `?${kueri}` : ''));
        res.end();
      });
    },
  };
}

function partials(): Plugin {
  const baca = (n: string): string => readFileSync(resolve(ROOT, 'src/partials', n), 'utf8');
  return {
    name: 'sikop-partials',
    transformIndexHtml(html, ctx) {
      const aktif = /<!--sikop:header aktif="([a-z]*)"-->/.exec(html)?.[1] ?? '';
      const nav = NAV.map(
        (n) =>
          `<li><a href="${n.href}"${n.id === aktif ? ' aria-current="page"' : ''}>${n.label}</a></li>`,
      ).join('');
      const kanonik = SITUS + (ctx.path.replace(/index\.html$/, '') || '/');
      return html
        .replace(
          /<!--sikop:header aktif="[a-z]*"-->/,
          baca('header.html').replace('<!--nav-->', nav),
        )
        .replace('<!--sikop:footer-->', baca('footer.html'))
        .replace('<!--sikop:head-->', baca('head.html').replace('%KANONIK%', kanonik));
    },
  };
}

export default defineConfig({
  root: ROOT,
  publicDir: 'public',
  plugins: [partials(), alihkan()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // MapLibre (~290 kB gzip) hanya dimuat di /peta/; halaman lain tidak menanggungnya.
    chunkSizeWarningLimit: 1100,
    // Jangan sisipkan aset sebagai data: URI; CSP (font-src/img-src 'self') sengaja tidak mengizinkannya.
    assetsInlineLimit: 0,
    rollupOptions: { input: cariHalaman(ROOT) },
  },
  server: {
    port: 5173,
    // Saat pengembangan, /api diteruskan ke `wrangler dev` (apps/api) di port 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
