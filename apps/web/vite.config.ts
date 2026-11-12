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

/**
 * Menerapkan aturan pengalihan sederhana dari public/_redirects (format Cloudflare Pages:
 * "sumber tujuan kode") di server pengembangan dan pratinjau Vite, agar perilaku lokal dan uji E2E di
 * CI sama dengan produksi. Di produksi berkas yang sama dibaca langsung oleh Cloudflare Pages.
 */
function pengalihan(): Plugin {
  const aturan = readFileSync(resolve(ROOT, 'public/_redirects'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    .filter((b): b is [string, string, ...string[]] => b.length >= 2)
    .map(([dari, ke, kode]) => ({ dari, ke, kode: Number(kode ?? 302) }));
  const pasang = (server: {
    middlewares: { use: (f: (req: Req, res: Res, next: () => void) => void) => void };
  }): void => {
    // Badan fungsi sengaja berupa blok: nilai kembali fungsi akan dianggap Vite sebagai hook lanjutan.
    server.middlewares.use((req, res, next) => {
      const [jalur, kueri] = (req.url ?? '').split('?');
      const a = aturan.find((x) => x.dari === jalur);
      if (!a) return next();
      res.statusCode = a.kode;
      res.setHeader('Location', a.ke + (kueri ? `?${kueri}` : ''));
      res.end();
    });
  };
  return { name: 'sikop-pengalihan', configureServer: pasang, configurePreviewServer: pasang };
}
type Req = { url?: string };
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void };

export default defineConfig({
  root: ROOT,
  publicDir: 'public',
  plugins: [partials(), pengalihan()],
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
