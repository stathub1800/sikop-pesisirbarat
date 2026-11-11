/**
 * Peta Tematik: SATU pintu data visual SIKOP. Semua indikator dari semua sumber (Dapodik, Podes, dan data
 * tambahan kelak) tampil sebagai kartu yang dikelompokkan per TEMA, bukan per menu atau per sumber.
 * Menambah data baru cukup menambah indikator bertema; tidak perlu halaman atau menu baru.
 *
 * Tata letak: panel lapisan (kiri) | peta MapLibre + kartu indikator aktif (tengah) | profil wilayah
 * lintas tema + urutan kecamatan (kanan). Status (indikator, tema, kecamatan) disimpan di URL.
 */
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as PetaGL,
  type StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  batasKelas,
  formatAngka,
  formatTanggal,
  JENJANG,
  kelasDari,
  sumberSingkat,
  urutkanTema,
} from '@sikop/shared';
import '../styles/peta.css';
import { get, qs } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import { situs } from '../lib/situs.ts';
import { galat, kerangka, kosong } from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

interface Rincian {
  pembilang: number | null;
  penyebut: number | null;
}
interface Indikator {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  sumber: string;
  tahun: string;
  metode: string;
  desimal: number;
  arah: 'naik_baik' | 'turun_baik' | 'netral';
  jenis: string;
  nilai: Record<string, number | null>;
  kabupaten: number | null;
  diperbarui: string | null;
  rincian?: Record<string, Rincian>;
  rincianKabupaten?: Rincian;
  unitPenyebut?: string;
}

mulaiHalaman();

const BATAS_BBOX: [[number, number], [number, number]] = [
  [103.55, -5.95],
  [104.72, -4.75],
];
const WARNA_JENJANG: Record<string, string> = {
  PAUD: '#d08c00',
  'SD/MI': '#2892c6',
  'SMP/MTs': '#4e9a2a',
  'SMA/SMK/MA': '#9a0501',
  SLB: '#7b4fb3',
  Nonformal: '#66778a',
};
const css = (v: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const warnaKelas = (): string[] =>
  ['--peta-1', '--peta-2', '--peta-3', '--peta-4', '--peta-5'].map(css);

const keadaan = {
  indikator: [] as Indikator[],
  aktif: null as Indikator | null,
  batas: [] as number[],
  kecamatan: [] as { kode: string; nama: string }[],
  pilih: new URLSearchParams(location.search).get('kec') ?? '',
  tema: '',
  cari: '',
};

/** Nilai lengkap dengan satuan: "86,0%", "5,0 km", "11,6 peserta didik per guru". */
const fmtPenuh = (ind: Indikator, v: number | null | undefined): string =>
  v === null || v === undefined
    ? 'Tidak ada data'
    : `${formatAngka(v, ind.desimal)}${ind.satuan === '%' ? '%' : ` ${ind.satuan}`}`;

/* ------------------------------ Peta ------------------------------ */

const gayaCadangan: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'latar', type: 'background', paint: { 'background-color': '#dceaf2' } }],
};

const peta: PetaGL = new maplibregl.Map({
  container: 'peta',
  style: 'https://tiles.openfreemap.org/styles/positron',
  bounds: BATAS_BBOX,
  fitBoundsOptions: { padding: 24 },
  maxBounds: [
    [102.8, -6.6],
    [105.6, -4.1],
  ],
  attributionControl: { compact: true, customAttribution: 'Batas kecamatan: BIG (indikatif)' },
  cooperativeGestures: window.matchMedia('(max-width: 860px)').matches,
  locale: {
    'NavigationControl.ZoomIn': 'Perbesar',
    'NavigationControl.ZoomOut': 'Perkecil',
    'NavigationControl.ResetBearing': 'Arahkan ke utara',
  },
});
peta.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
peta.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

// Bila peta dasar tidak dapat dimuat (jaringan lemah, diblokir), tetap tampilkan lapisan data di atas latar polos.
let pakaiCadangan = false;
const keCadangan = (): void => {
  if (pakaiCadangan || peta.isStyleLoaded()) return;
  pakaiCadangan = true;
  peta.setStyle(gayaCadangan);
  $('#catatan-peta-dasar').hidden = false;
};
const cadangan = setTimeout(keCadangan, 8000);
peta.on('error', () => {
  if (!peta.isStyleLoaded()) keCadangan();
});

peta.on('style.load', () => {
  clearTimeout(cadangan);
  pasangLapisan();
});

function pasangLapisan(): void {
  if (peta.getSource('kec')) return;
  const garis = css('--laut-900') || '#0b3a57';
  peta.addSource('kec', { type: 'geojson', data: '/data/kecamatan.geojson', promoteId: 'kode' });
  const w = warnaKelas();
  peta.addLayer({
    id: 'kec-isi',
    type: 'fill',
    source: 'kec',
    paint: {
      'fill-color': [
        'case',
        ['!', ['boolean', ['feature-state', 'ada'], false]],
        css('--peta-kosong') || '#e8ecef',
        ['match', ['feature-state', 'kelas'], 0, w[0]!, 1, w[1]!, 2, w[2]!, 3, w[3]!, w[4]!],
      ],
      'fill-opacity': 0.82,
    },
  });
  peta.addLayer({
    id: 'kec-garis',
    type: 'line',
    source: 'kec',
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'pilih'], false], '#febd26', garis],
      'line-width': ['case', ['boolean', ['feature-state', 'pilih'], false], 4, 1.2],
    },
  });
  peta.addSource('kec-label', { type: 'geojson', data: '/data/kecamatan-label.geojson' });
  peta.addLayer({
    id: 'kec-label',
    type: 'symbol',
    source: 'kec-label',
    layout: {
      'text-field': ['get', 'nama'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-max-width': 8,
    },
    paint: { 'text-color': '#132a3a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
  peta.addSource('sekolah', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  peta.addLayer({
    id: 'sekolah-titik',
    type: 'circle',
    source: 'sekolah',
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 7],
      'circle-color': [
        'match',
        ['get', 'jenjang'],
        ...Object.entries(WARNA_JENJANG).flat(),
        '#66778a',
      ] as unknown as ExpressionSpecification,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.2,
    },
  });
  terapkanIndikator();
  if (keadaan.pilih) pilihKecamatan(keadaan.pilih, false);
  if (($('#tampil-sekolah') as HTMLInputElement).checked) void tampilkanSekolah(true);
}

peta.on('click', 'kec-isi', (e) => {
  const kode = e.features?.[0]?.properties?.kode as string | undefined;
  if (kode) pilihKecamatan(kode, false);
});
peta.on('click', 'sekolah-titik', (e) => {
  const f = e.features?.[0];
  if (!f) return;
  const p = f.properties as { npsn: string; nama: string; jenjang: string; status: string };
  const coords = (f.geometry as Point).coordinates as [number, number];
  new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
    .setLngLat(coords)
    .setDOMContent(
      h(
        'div',
        null,
        h('strong', null, p.nama),
        h('span', null, `${p.jenjang}, ${p.status}`),
        h('br'),
        h(
          'a',
          { href: `/sekolah/profil/?npsn=${encodeURIComponent(p.npsn)}` },
          'Lihat profil sekolah',
        ),
      ),
    )
    .addTo(peta);
});
for (const lap of ['kec-isi', 'sekolah-titik']) {
  peta.on('mouseenter', lap, () => (peta.getCanvas().style.cursor = 'pointer'));
  peta.on('mouseleave', lap, () => (peta.getCanvas().style.cursor = ''));
}

/* --------------------------- Panel lapisan (kartu indikator) --------------------------- */

/** "84 dari 121 desa" untuk persentase berbasis hitungan desa; "median dari 102 desa" untuk median. */
function rinciTeks(ind: Indikator, r: Rincian | null | undefined): string {
  if (!r || r.penyebut === null) return '';
  const unit = ind.unitPenyebut ?? 'desa';
  return ind.satuan === '%'
    ? `${formatAngka(r.pembilang)} dari ${formatAngka(r.penyebut)} ${unit}`
    : `median dari ${formatAngka(r.penyebut)} ${unit}`;
}
const labelSumber = (ind: Indikator): string => {
  const s = sumberSingkat(ind.sumber);
  return s.includes(ind.tahun) ? s : `${s} ${ind.tahun}`.trim();
};

function gambarTema(): void {
  const chip = (nilai: string, label: string): HTMLButtonElement =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(keadaan.tema === nilai),
        onclick: () => {
          keadaan.tema = nilai;
          gambarTema();
          gambarKartu();
        },
      },
      label,
    );
  isi(
    $('#pilih-tema'),
    chip('', 'Semua tema'),
    urutkanTema(keadaan.indikator.map((i) => i.kategori)).map((t) => chip(t, t)),
  );
}

function gambarKartu(): void {
  const q = keadaan.cari.trim().toLowerCase();
  const cocok = keadaan.indikator.filter(
    (i) =>
      (!keadaan.tema || i.kategori === keadaan.tema) &&
      (!q || `${i.nama} ${i.kategori} ${i.sumber} ${i.metode}`.toLowerCase().includes(q)),
  );
  const wadah = $('#daftar-kartu');
  if (!cocok.length) {
    isi(wadah, kosong('Tidak ada indikator yang cocok', 'Ubah kata kunci atau pilih tema lain.'));
    return;
  }
  const kelompok = urutkanTema(cocok.map((i) => i.kategori));
  isi(
    wadah,
    kelompok.map((t) => [
      keadaan.tema ? null : h('p', { class: 'kartu-daftar__tema' }, t),
      cocok
        .filter((i) => i.kategori === t)
        .map((i) =>
          h(
            'button',
            {
              type: 'button',
              class: 'kartu-ind',
              'aria-pressed': String(i.id === keadaan.aktif?.id),
              'data-id': i.id,
              onclick: () => pilihIndikator(i.id),
            },
            h(
              'span',
              { class: 'kartu-ind__atas' },
              h('span', { class: 'kartu-ind__nama' }, i.nama),
              h('span', { class: 'kartu-ind__sumber' }, labelSumber(i)),
            ),
            h(
              'span',
              { class: 'kartu-ind__angka' },
              h('strong', { class: 'angka' }, fmtPenuh(i, i.kabupaten)),
              h('span', null, rinciTeks(i, i.rincianKabupaten)),
            ),
            i.satuan === '%' && i.kabupaten !== null
              ? h(
                  'span',
                  { class: 'bar', 'aria-hidden': 'true' },
                  h('span', { style: { width: `${Math.min(100, Math.max(0, i.kabupaten))}%` } }),
                )
              : null,
          ),
        ),
    ]),
  );
}

function pilihIndikator(id: string): void {
  keadaan.aktif = keadaan.indikator.find((i) => i.id === id) ?? keadaan.aktif;
  for (const b of document.querySelectorAll<HTMLElement>('.kartu-ind'))
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  terapkanIndikator();
}

/* --------------------------- Indikator aktif di peta --------------------------- */

function terapkanIndikator(): void {
  const ind = keadaan.aktif;
  if (!ind) return;
  keadaan.batas = batasKelas(Object.values(ind.nilai), 5);
  if (peta.getSource('kec')) {
    for (const k of keadaan.kecamatan) {
      const v = ind.nilai[k.kode] ?? null;
      peta.setFeatureState(
        { source: 'kec', id: k.kode },
        { ada: v !== null, kelas: v === null ? 0 : kelasDari(v, keadaan.batas) },
      );
    }
  }
  tampilInfo(ind);
  tampilPeringkat(ind);
  tampilProfil();
  simpanUrl();
}

function simpanUrl(): void {
  const u = new URL(location.href);
  if (keadaan.aktif) u.searchParams.set('ind', keadaan.aktif.id);
  if (keadaan.pilih) u.searchParams.set('kec', keadaan.pilih);
  else u.searchParams.delete('kec');
  history.replaceState(null, '', u);
}

const teksArah: Record<Indikator['arah'], string> = {
  naik_baik: 'Makin tinggi makin baik.',
  turun_baik: 'Makin rendah makin baik.',
  netral: 'Gambaran kondisi, bukan ukuran baik atau buruk.',
};

function tampilInfo(ind: Indikator): void {
  isi(
    $('#info-indikator'),
    h('p', { class: 'label-kecil' }, `${ind.kategori} · ${labelSumber(ind)}`),
    h('h2', { class: 'kartu-aktif__judul' }, ind.nama),
    h(
      'p',
      { class: 'kartu-aktif__nilai' },
      h('span', { class: 'label-kecil' }, 'Kabupaten '),
      h('strong', { class: 'angka' }, fmtPenuh(ind, ind.kabupaten)),
      ind.rincianKabupaten ? h('span', null, ` ${rinciTeks(ind, ind.rincianKabupaten)}`) : null,
    ),
    tampilLegenda(ind),
    h(
      'details',
      null,
      h('summary', null, 'Sumber dan cara hitung'),
      h('p', null, ind.metode),
      h(
        'p',
        { class: 'sumber' },
        `${teksArah[ind.arah]} Sumber: ${ind.sumber}, ${ind.tahun}.`,
        ind.diperbarui ? ` Diperbarui ${formatTanggal(ind.diperbarui)}.` : '',
      ),
    ),
  );
}

function tampilLegenda(ind: Indikator): HTMLElement {
  const w = warnaKelas();
  const b = keadaan.batas;
  // Satuan ditulis sekali di judul legenda agar label kelas tetap pendek di layar kecil.
  const f = (v: number): string => `${formatAngka(v, ind.desimal)}${ind.satuan === '%' ? '%' : ''}`;
  const nilai = Object.values(ind.nilai).filter((x): x is number => x !== null);
  const maks = nilai.length ? Math.max(...nilai) : 0;
  const kelas = b.length + 1;
  const items: HTMLElement[] = [];
  for (let i = 0; i < kelas; i++) {
    const label =
      b.length === 0
        ? 'Semua kecamatan sama'
        : i === 0
          ? `di bawah ${f(b[0]!)}`
          : i === kelas - 1
            ? b[i - 1] === maks
              ? f(b[i - 1]!)
              : `${f(b[i - 1]!)} ke atas`
            : `${f(b[i - 1]!)} sampai di bawah ${f(b[i]!)}`;
    items.push(h('li', null, h('i', { style: { background: w[i] ?? w[4] ?? '' } }), label));
  }
  if (Object.values(ind.nilai).some((v) => v === null))
    items.push(
      h('li', null, h('i', { style: { background: css('--peta-kosong') } }), 'Tidak ada data'),
    );
  return h(
    'div',
    null,
    ind.satuan !== '%'
      ? h('p', { class: 'label-kecil legenda__satuan' }, `Satuan: ${ind.satuan}`)
      : null,
    h('ul', { class: 'legenda', id: 'legenda', 'aria-label': 'Legenda warna peta' }, items),
  );
}

function tampilPeringkat(ind: Indikator): void {
  const baris = keadaan.kecamatan
    .map((k) => ({ ...k, v: ind.nilai[k.kode] ?? null }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const maks = Math.max(1e-9, ...baris.map((b) => b.v ?? 0), ind.kabupaten ?? 0);
  $('#ket-urut').textContent = `${ind.nama}, tertinggi di atas. Garis tegak = angka kabupaten.`;
  isi(
    $('#tabel-peringkat'),
    baris.map((r) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            class: 'urut__baris',
            'data-kode': r.kode,
            'aria-pressed': String(r.kode === keadaan.pilih),
            onclick: () => pilihKecamatan(r.kode, true),
          },
          h('span', { class: 'urut__nama' }, r.nama),
          h(
            'span',
            { class: 'bar bar--urut', 'aria-hidden': 'true' },
            h('span', {
              style: { width: `${r.v === null ? 0 : (100 * Math.max(0, r.v)) / maks}%` },
            }),
            ind.kabupaten !== null
              ? h('i', { class: 'bar__kab', style: { left: `${(100 * ind.kabupaten) / maks}%` } })
              : null,
          ),
          h('span', { class: 'urut__nilai angka' }, fmtPenuh(ind, r.v)),
        ),
      ),
    ),
  );
}

/* --------------------------- Profil wilayah lintas tema --------------------------- */

function tampilProfil(): void {
  const ind = keadaan.aktif;
  const k = keadaan.kecamatan.find((x) => x.kode === keadaan.pilih);
  const nilai = (i: Indikator): number | null => (k ? (i.nilai[k.kode] ?? null) : i.kabupaten);
  const tema = urutkanTema(keadaan.indikator.map((i) => i.kategori));
  isi(
    $('#detail-kecamatan'),
    h('p', { class: 'label-kecil' }, k ? 'Profil kecamatan' : 'Profil kabupaten'),
    h('h2', null, k ? `Kecamatan ${k.nama}` : 'Kabupaten Pesisir Barat'),
    h(
      'p',
      { class: 'sumber' },
      k
        ? 'Angka kecamatan dibandingkan dengan kabupaten, untuk semua tema dan sumber data.'
        : 'Ringkasan semua tema. Klik wilayah di peta atau nama kecamatan di urutan untuk melihat profil kecamatan.',
    ),
    k
      ? h(
          'div',
          { class: 'baris-tombol' },
          h(
            'a',
            { class: 'tombol tombol--kecil tombol--primer', href: `/kecamatan/?kode=${k.kode}` },
            'Halaman profil',
          ),
          h(
            'a',
            { class: 'tombol tombol--kecil', href: `/sekolah/?kec=${k.kode}` },
            'Daftar sekolah',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'tombol tombol--kecil tombol--polos',
              onclick: () => lepasKecamatan(),
            },
            'Kembali ke kabupaten',
          ),
        )
      : null,
    tema.map((t) => {
      const daftar = keadaan.indikator.filter((i) => i.kategori === t);
      return h(
        'details',
        { class: 'profil-tema', open: t === ind?.kategori },
        h(
          'summary',
          null,
          t,
          h('span', { class: 'profil-tema__jumlah' }, `${daftar.length} indikator`),
        ),
        h(
          'table',
          { class: 'profil-tabel' },
          h('caption', { class: 'sr' }, `Tema ${t}`),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Indikator'),
              h('th', { scope: 'col', class: 'kanan' }, k ? k.nama : 'Kabupaten'),
              k ? h('th', { scope: 'col', class: 'kanan' }, 'Kab.') : null,
            ),
          ),
          h(
            'tbody',
            null,
            daftar.map((i) =>
              h(
                'tr',
                { class: i.id === ind?.id ? 'aktif' : null },
                h(
                  'th',
                  { scope: 'row' },
                  h(
                    'button',
                    { type: 'button', class: 'tautan-polos', onclick: () => pilihIndikator(i.id) },
                    i.nama,
                  ),
                  h('small', null, labelSumber(i)),
                ),
                h(
                  'td',
                  { class: 'kanan angka' },
                  fmtPenuh(i, nilai(i)),
                  k && i.rincian?.[k.kode]
                    ? h('small', null, rinciTeks(i, i.rincian[k.kode]))
                    : null,
                ),
                k ? h('td', { class: 'kanan angka teks-redup' }, fmtPenuh(i, i.kabupaten)) : null,
              ),
            ),
          ),
        ),
      );
    }),
  );
}

function pilihKecamatan(kode: string, terbang: boolean): void {
  if (keadaan.pilih && peta.getSource('kec'))
    peta.setFeatureState({ source: 'kec', id: keadaan.pilih }, { pilih: false });
  keadaan.pilih = kode;
  if (peta.getSource('kec')) peta.setFeatureState({ source: 'kec', id: kode }, { pilih: true });
  for (const b of document.querySelectorAll<HTMLElement>('.urut__baris'))
    b.setAttribute('aria-pressed', String(b.dataset.kode === kode));
  tampilProfil();
  simpanUrl();
  if (terbang) void terbangKe(kode);
  if (window.matchMedia('(max-width: 1180px)').matches && terbang)
    $('#detail-kecamatan').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lepasKecamatan(): void {
  if (keadaan.pilih && peta.getSource('kec'))
    peta.setFeatureState({ source: 'kec', id: keadaan.pilih }, { pilih: false });
  keadaan.pilih = '';
  for (const b of document.querySelectorAll<HTMLElement>('.urut__baris'))
    b.setAttribute('aria-pressed', 'false');
  tampilProfil();
  simpanUrl();
  peta.fitBounds(BATAS_BBOX, { padding: 24 });
}

async function terbangKe(kode: string): Promise<void> {
  try {
    const r = await get<{ kecamatan: { bbox: [number, number, number, number] } }>(
      `/kecamatan/${kode}`,
    );
    const [a, b, c, d] = r.kecamatan.bbox;
    peta.fitBounds(
      [
        [a, b],
        [c, d],
      ],
      {
        padding: 48,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800,
      },
    );
  } catch {
    /* perbesaran peta bersifat tambahan; profil tetap tampil */
  }
}

/* ---------------------------- Sekolah ---------------------------- */

let semuaTitik: FeatureCollection | null = null;
async function tampilkanSekolah(tampil: boolean): Promise<void> {
  if (!peta.getLayer('sekolah-titik')) return;
  peta.setLayoutProperty('sekolah-titik', 'visibility', tampil ? 'visible' : 'none');
  $('#legenda-sekolah').hidden = !tampil;
  if (!tampil) return;
  if (!semuaTitik) {
    try {
      semuaTitik = await get<FeatureCollection>('/sekolah/titik');
      $('#catatan-titik').textContent =
        `${formatAngka(semuaTitik.features.length)} sekolah memiliki koordinat yang layak tampil. Sekolah tanpa koordinat tetap tercantum di halaman Data Sekolah.`;
    } catch (e) {
      isi($('#catatan-titik'), galat(e));
      return;
    }
  }
  (peta.getSource('sekolah') as GeoJSONSource).setData(semuaTitik);
  const j = ($('#filter-jenjang') as HTMLSelectElement).value;
  peta.setFilter('sekolah-titik', j ? ['==', ['get', 'jenjang'], j] : null);
}

/* ----------------------------- Pencarian ----------------------------- */

function pasangPencarian(): void {
  const input = $('#cari-peta-input') as HTMLInputElement;
  const daftar = $('#hasil-cari');
  let tunda = 0;
  let aktif = -1;
  const tutup = (): void => {
    daftar.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    aktif = -1;
  };
  const pilih = (li: HTMLElement): void => {
    tutup();
    input.value = li.dataset.label ?? '';
    if (li.dataset.kec) pilihKecamatan(li.dataset.kec, true);
    else if (li.dataset.npsn)
      location.href = `/sekolah/profil/?npsn=${encodeURIComponent(li.dataset.npsn)}`;
  };
  input.addEventListener('input', () => {
    clearTimeout(tunda);
    const q = input.value.trim();
    if (q.length < 2) return tutup();
    tunda = window.setTimeout(async () => {
      const kec = keadaan.kecamatan.filter((k) => k.nama.toLowerCase().includes(q.toLowerCase()));
      let sek: { npsn: string; nama: string; jenjang: string; kode_kec: string }[] = [];
      try {
        sek = (await get<{ items: typeof sek }>(`/sekolah${qs({ q, ukuran: 6 })}`)).items;
      } catch {
        /* pencarian sekolah opsional; kecamatan tetap tampil */
      }
      const nk = (kode: string): string =>
        keadaan.kecamatan.find((k) => k.kode === kode)?.nama ?? '';
      const opsi = [
        ...kec.map((k) =>
          h(
            'li',
            { role: 'option', 'data-kec': k.kode, 'data-label': k.nama },
            `Kecamatan ${k.nama}`,
          ),
        ),
        ...sek.map((s) =>
          h(
            'li',
            { role: 'option', 'data-npsn': s.npsn, 'data-label': s.nama },
            s.nama,
            h('small', null, `${s.jenjang}, Kec. ${nk(s.kode_kec)}`),
          ),
        ),
      ];
      isi(
        daftar,
        opsi.length
          ? opsi
          : h('li', { role: 'option', 'aria-disabled': 'true' }, `Tidak ada hasil untuk "${q}".`),
      );
      daftar.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    const items = [...daftar.querySelectorAll<HTMLElement>('li[data-label]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      aktif = (aktif + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === aktif)));
    } else if (e.key === 'Enter' && aktif >= 0) {
      const li = items[aktif];
      e.preventDefault();
      if (li) pilih(li);
    } else if (e.key === 'Escape') tutup();
  });
  daftar.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[data-label]');
    if (li) pilih(li);
  });
  $('#cari-peta').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('click', (e) => {
    if (!$('#cari-peta').contains(e.target as Node)) tutup();
  });
}

/* ------------------------------ Panel: cari, ciutkan ------------------------------ */

function pasangPanel(): void {
  const cari = $('#cari-indikator') as HTMLInputElement;
  cari.addEventListener('input', () => {
    keadaan.cari = cari.value;
    gambarKartu();
  });
  const tombol = $('#tombol-ciut');
  const atur = (ciut: boolean): void => {
    tombol.setAttribute('aria-expanded', String(!ciut));
    tombol.textContent = ciut ? 'Bentangkan' : 'Ciutkan';
    $('#isi-panel').hidden = ciut;
    $('.peta-app').classList.toggle('panel-ciut', ciut);
    requestAnimationFrame(() => peta.resize());
  };
  tombol.addEventListener('click', () => atur(tombol.getAttribute('aria-expanded') === 'true'));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      atur(false);
      cari.focus();
    }
  });
}

/* ------------------------------ Mulai ------------------------------ */

async function mulai(): Promise<void> {
  pasangPencarian();
  pasangPanel();
  const jenjang = $('#filter-jenjang') as HTMLSelectElement;
  for (const j of JENJANG) jenjang.appendChild(h('option', { value: j }, j));
  isi(
    $('#legenda-sekolah'),
    Object.entries(WARNA_JENJANG).map(([j, w]) =>
      h('li', null, h('i', { style: { background: w } }), j),
    ),
  );
  ($('#tampil-sekolah') as HTMLInputElement).addEventListener(
    'change',
    (e) => void tampilkanSekolah((e.target as HTMLInputElement).checked),
  );
  jenjang.addEventListener(
    'change',
    () => void tampilkanSekolah(($('#tampil-sekolah') as HTMLInputElement).checked),
  );

  isi($('#daftar-kartu'), kerangka(6));
  let data: [{ indikator: Indikator[] }, Awaited<ReturnType<typeof situs>>];
  try {
    data = await Promise.all([get<{ indikator: Indikator[] }>('/indikator'), situs()]);
  } catch (e) {
    isi(
      $('#daftar-kartu'),
      galat(e, () => void mulai()),
    );
    return;
  }
  const [{ indikator }, s] = data;
  keadaan.indikator = indikator;
  keadaan.kecamatan = s.kecamatan;
  $('#sumber-batas').textContent = s.pengaturan.sumber_batas_wilayah ?? '';
  if (!indikator.length) {
    isi(
      $('#daftar-kartu'),
      kosong('Belum ada indikator', 'Indikator akan tampil setelah pengelola menerbitkannya.'),
    );
    return;
  }
  const sumber = [...new Set(indikator.map(labelSumber))];
  $('#sub-sumber').textContent =
    `${formatAngka(indikator.length)} indikator dari ${sumber.join(', ')}`;
  const awal = new URLSearchParams(location.search).get('ind');
  keadaan.aktif =
    indikator.find((i) => i.id === awal) ??
    indikator.find((i) => i.id === 'rasio_murid_guru') ??
    indikator[0]!;
  const temaAwal = new URLSearchParams(location.search).get('tema');
  if (temaAwal && indikator.some((i) => i.kategori === temaAwal)) keadaan.tema = temaAwal;
  if (keadaan.pilih && !keadaan.kecamatan.some((k) => k.kode === keadaan.pilih)) keadaan.pilih = '';
  gambarTema();
  gambarKartu();
  if (peta.isStyleLoaded()) pasangLapisan();
  terapkanIndikator();
}

void mulai();
