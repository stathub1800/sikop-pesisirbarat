/**
 * Peta pesisir SVG ringan dari /data/kecamatan.geojson (tanpa pustaka peta).
 * Setiap kecamatan adalah tautan yang dapat difokus dengan keyboard dan memiliki label pembaca layar.
 * Dipakai di beranda (sebagai pintu masuk) dan halaman profil kecamatan (sebagai penunjuk lokasi).
 */
import { formatAngka } from '@sikop/shared';
import '../styles/peta-pesisir.css';

type Ring = number[][];
interface Fitur {
  properties: { kode: string; nama: string; urutan: number };
  geometry:
    { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

const NS = 'http://www.w3.org/2000/svg';
let cache: Promise<Fitur[]> | null = null;

export const batasKecamatan = (): Promise<Fitur[]> =>
  (cache ??= fetch('/data/kecamatan.geojson')
    .then((r) => {
      if (!r.ok) throw new Error('Batas wilayah tidak dapat dimuat');
      return r.json() as Promise<{ features: Fitur[] }>;
    })
    .then((g) => g.features));

export interface OpsiPeta {
  /** Nilai per kode kecamatan untuk pewarnaan (opsional). */
  nilai?: Record<string, number>;
  satuanNilai?: string;
  /** Kelas warna 0..5 per kode (0 = tidak ada data); bila diisi, menggantikan pewarnaan dari `nilai`. */
  kelas?: Record<string, number>;
  /** Label aksesibel per kode (menggantikan label bawaan). */
  label?: (kode: string, nama: string) => string;
  /** Wilayah menjadi tombol: dipanggil saat diklik atau ditekan Enter/Spasi. */
  pilih?: (kode: string) => void;
  /** Kode kecamatan yang disorot (halaman profil). */
  sorot?: string;
  tautan?: (kode: string) => string;
  judul: string;
  /** Tampilkan label "Samudra Hindia" (bawaan: ya). */
  labelLaut?: boolean;
}

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export async function gambarPeta(opsi: OpsiPeta): Promise<SVGSVGElement> {
  const fitur = await batasKecamatan();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const semuaRing = (f: Fitur): Ring[] =>
    f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  for (const f of fitur)
    for (const r of semuaRing(f))
      for (const [x, y] of r as [number, number][]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  // Proyeksi equirectangular dengan koreksi cos(lintang): cukup akurat untuk wilayah sekecil ini.
  const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const W = 1000;
  const skala = W / ((maxX - minX) * kx);
  const H = Math.ceil((maxY - minY) * skala);
  const px = (x: number): string => ((x - minX) * kx * skala).toFixed(1);
  const py = (y: number): string => ((maxY - y) * skala).toFixed(1);
  const d = (f: Fitur): string =>
    semuaRing(f)
      .map((r) => 'M' + r.map(([x, y]) => `${px(x as number)},${py(y as number)}`).join('L') + 'Z')
      .join('');

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'peta-pesisir',
    role: 'group',
    'aria-label': opsi.judul,
  });
  const nilai = Object.values(opsi.nilai ?? {});
  const maks = Math.max(1, ...nilai);
  for (const f of fitur) {
    const { kode, nama } = f.properties;
    const n = opsi.nilai?.[kode];
    const kelas =
      opsi.kelas?.[kode] ?? (n === undefined ? 0 : Math.min(5, 1 + Math.floor((n / maks) * 4.999)));
    const path = el('path', {
      d: d(f),
      class: `peta-pesisir__wil k${kelas}${opsi.sorot === kode ? ' disorot' : ''}`,
      'data-kode': kode,
    });
    const label =
      opsi.label?.(kode, nama) ??
      `Kecamatan ${nama}${n !== undefined ? `, ${formatAngka(n)} ${opsi.satuanNilai ?? ''}` : ''}`;
    if (opsi.pilih) {
      const pilih = opsi.pilih;
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', label);
      path.addEventListener('click', () => pilih(kode));
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pilih(kode);
        }
      });
      svg.appendChild(path);
    } else if (opsi.tautan) {
      const a = el('a', { href: opsi.tautan(kode), 'aria-label': label, 'data-kode': kode });
      const title = el('title', {});
      title.textContent = label;
      a.append(title, path);
      svg.appendChild(a);
    } else {
      const title = el('title', {});
      title.textContent = label;
      path.appendChild(title);
      svg.appendChild(path);
    }
  }
  if (opsi.labelLaut !== false) {
    // Pesisir Barat menghadap Samudra Hindia di barat daya; label ini memberi orientasi tanpa peta dasar.
    const laut = el('text', {
      x: String(W * 0.06),
      y: String(H * 0.9),
      class: 'peta-pesisir__laut',
      'aria-hidden': 'true',
    });
    laut.textContent = 'Samudra Hindia';
    svg.appendChild(laut);
  }
  return svg;
}

/** Menautkan sorotan antara daftar (elemen ber-data-kode) dan wilayah di peta, dua arah. */
export function tautkanSorotan(svg: SVGSVGElement, daftar: HTMLElement): void {
  const atur = (kode: string | null): void => {
    for (const p of svg.querySelectorAll('.peta-pesisir__wil'))
      p.classList.toggle('aktif', p.getAttribute('data-kode') === kode);
    for (const li of daftar.querySelectorAll<HTMLElement>('[data-kode]'))
      li.classList.toggle('aktif', li.dataset.kode === kode);
  };
  const dariTarget = (e: Event): string | null =>
    (e.target as Element).closest('[data-kode]')?.getAttribute('data-kode') ?? null;
  for (const root of [svg, daftar]) {
    root.addEventListener('pointerover', (e) => atur(dariTarget(e)));
    root.addEventListener('focusin', (e) => atur(dariTarget(e)));
    root.addEventListener('pointerleave', () => atur(null));
    root.addEventListener('focusout', () => atur(null));
  }
}
