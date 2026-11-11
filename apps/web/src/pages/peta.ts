/**
 * Peta Tematik: satu pintu data visual SIKOP (ADR-0006), pola antarmuka mengikuti SIGER Desa.
 *
 * Alur yang dibaca pimpinan, dari kiri ke kanan dan atas ke bawah:
 *   1. Panel kanan  : Profil wilayah (kabupaten, atau kecamatan terpilih) → tab tema → kartu indikator.
 *   2. Klik kartu   : peta diwarnai, setiap kecamatan diberi label angka, peringkat dan legenda di kiri bawah.
 *   3. Klik wilayah : peta memperbesar kecamatan itu, sisanya diredupkan, dan semua kartu menampilkan angka
 *                     kecamatan tersebut dibandingkan kabupaten beserta peringkatnya.
 * Status (tema, indikator, kecamatan) tersimpan di URL agar tampilan dapat dibagikan.
 */
import * as maplibregl from 'maplibre-gl';
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as PetaGL,
  StyleSpecification,
} from 'maplibre-gl';
// MapLibre 6 memuat worker sebagai berkas terpisah; Vite menyalinnya ke /assets dengan nama ber-hash.
import urlWorkerPeta from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  batasKelas,
  formatAngka,
  formatTanggal,
  JENJANG,
  kelasDari,
  urutkanTema,
} from '@sikop/shared';
import '../styles/peta.css';
import { get, qs } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import {
  banding,
  fmt,
  fmtPil,
  fmtRingkas,
  ikon,
  LABEL_TAB,
  labelSumber,
  peringkat as peringkatDari,
  persen,
  rinci,
  TEMA_PROFIL,
  urutKecamatan as urutKecamatanDari,
  type BarisPeringkat,
  type Indikator,
} from '../lib/indikator.ts';
import { situs } from '../lib/situs.ts';
import { galat, kerangka, kosong } from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

type FiturKec = Feature<Polygon | MultiPolygon, { kode: string; nama: string }>;

mulaiHalaman();
maplibregl.setWorkerUrl(urlWorkerPeta);

/* ------------------------------ Konstanta tampilan ------------------------------ */

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
/** Label pendek fakta wilayah di kartu profil. */
const LABEL_FAKTA: Record<string, string> = {
  podes_pesisir: 'desa pesisir',
  podes_hutan: 'tepi hutan',
  podes_perkotaan: 'perkotaan',
  podes_pertanian: 'bertani',
};

const css = (v: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const warnaKelas = (): string[] =>
  ['--peta-1', '--peta-2', '--peta-3', '--peta-4', '--peta-5'].map(css);
/** Tata letak tumpuk (peta di atas, panel di bawah): ponsel, serta layar tegak hingga 1280 px. */
const KUERI_TUMPUK = '(max-width: 860px), (max-width: 1280px) and (orientation: portrait)';
const sempit = (): boolean => window.matchMedia(KUERI_TUMPUK).matches;

/* ------------------------------ Keadaan ------------------------------ */

const url = new URLSearchParams(location.search);
const keadaan = {
  indikator: [] as Indikator[],
  aktif: null as Indikator | null,
  tema: url.get('tema') ?? '',
  kec: url.get('kec') ?? '',
  batas: [] as number[],
  kecamatan: [] as { kode: string; nama: string }[],
  fitur: new Map<string, FiturKec>(),
  semuaPeringkat: false,
};

const namaKec = (kode: string): string =>
  keadaan.kecamatan.find((k) => k.kode === kode)?.nama ?? kode;

const urutKecamatan = (i: Indikator): BarisPeringkat[] => urutKecamatanDari(i, keadaan.kecamatan);
const peringkat = (i: Indikator, kode: string): number | null =>
  peringkatDari(i, keadaan.kecamatan, kode);

/* ------------------------------ Peta ------------------------------ */

const gayaCadangan: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'latar',
      type: 'background',
      paint: { 'background-color': css('--peta-latar') || '#e7eff4' },
    },
  ],
};

const peta: PetaGL = new maplibregl.Map({
  container: 'peta',
  style: 'https://tiles.openfreemap.org/styles/positron',
  bounds: BATAS_BBOX,
  fitBoundsOptions: { padding: 40 },
  // Batas geser longgar: batas sempit membuat peta tak bisa diperkecil di layar tegak.
  maxBounds: [
    [99.5, -11],
    [109, -0.5],
  ],
  minZoom: 6,
  attributionControl: { compact: true, customAttribution: 'Batas kecamatan: BIG (indikatif)' },
  cooperativeGestures: sempit(),
  locale: { 'CooperativeGesturesHandler.MobileHelpText': 'Gunakan dua jari untuk menggeser peta' },
});

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
peta.once('load', () => {
  // Atribusi tampil ringkas (ikon i) agar tidak menutupi kontrol; isi lengkap muncul saat diklik.
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  if (!keadaan.kec) peta.fitBounds(BATAS_BBOX, { padding: paddingPeta(), duration: 0 });
});

/** Ruang di tepi peta agar wilayah tidak tertutup panel melayang. */
const paddingPeta = (): maplibregl.PaddingOptions => {
  if (sempit()) return { top: 70, bottom: 60, left: 24, right: 24 };
  const bersih = Boolean(document.querySelector('.peta-app.bersih'));
  const lebar = window.innerWidth;
  return {
    top: 80,
    bottom: 40,
    left: bersih ? 40 : lebar <= 1180 ? 270 : 320,
    right: bersih ? 40 : lebar <= 1180 ? 370 : 430,
  };
};

function pasangLapisan(): void {
  if (peta.getSource('kec')) return;
  const w = warnaKelas();
  peta.addSource('kec', { type: 'geojson', data: '/data/kecamatan.geojson', promoteId: 'kode' });
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
      'fill-opacity': ['case', ['boolean', ['feature-state', 'redup'], false], 0.28, 0.9],
    },
  });
  peta.addLayer({
    id: 'kec-garis',
    type: 'line',
    source: 'kec',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'pilih'], false],
        css('--laut-900') || '#0b3a57',
        '#ffffff',
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'pilih'], false],
        3.5,
        ['boolean', ['feature-state', 'sorot'], false],
        2.6,
        1.2,
      ],
    },
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
  terapkanPeta();
  if (($('#tampil-sekolah') as HTMLInputElement).checked) void tampilkanSekolah(true);
}

/* Label angka per kecamatan (penanda HTML, tidak bergantung pada huruf peta dasar). */
const penanda = new Map<string, { el: HTMLElement; angka: HTMLElement }>();
async function pasangPenanda(): Promise<void> {
  const g = await fetch('/data/kecamatan-label.geojson').then(
    (r) => r.json() as Promise<FeatureCollection<Point, { kode: string; nama: string }>>,
  );
  for (const f of g.features) {
    const { kode, nama } = f.properties;
    const angka = h('span', { class: 'pil__angka' }, '–');
    const el = h(
      'button',
      {
        type: 'button',
        class: 'pil',
        'aria-label': `Kecamatan ${nama}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          pilihKecamatan(kode);
        },
        onpointerenter: () => tampilTip(kode),
        onpointerleave: () => sembunyiTip(),
      },
      h('span', { class: 'pil__nama' }, nama),
      angka,
    );
    new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(f.geometry.coordinates as [number, number])
      .addTo(peta);
    penanda.set(kode, { el, angka });
  }
  terapkanPeta();
}
peta.on('zoom', () =>
  $('.peta-kanvas').classList.toggle('dengan-nama', peta.getZoom() >= 9.6 || Boolean(keadaan.kec)),
);

/* Tooltip wilayah */
let sorotan = '';
function tampilTip(kode: string, x?: number, y?: number): void {
  const i = keadaan.aktif;
  if (!i) return;
  if (sorotan !== kode) {
    if (sorotan) peta.setFeatureState({ source: 'kec', id: sorotan }, { sorot: false });
    sorotan = kode;
    if (peta.getSource('kec')) peta.setFeatureState({ source: 'kec', id: kode }, { sorot: true });
  }
  const r = peringkat(i, kode);
  const tip = $('#tip-peta');
  isi(
    tip,
    h('strong', null, `Kecamatan ${namaKec(kode)}`),
    h('span', { class: 'tip__nilai' }, fmt(i, i.nilai[kode])),
    i.rincian?.[kode] ? h('span', null, rinci(i, i.rincian[kode])) : null,
    r ? h('span', null, `Peringkat ${r} dari ${keadaan.kecamatan.length}`) : null,
  );
  tip.hidden = false;
  const kanvas = $('.peta-kanvas').getBoundingClientRect();
  const pos =
    x !== undefined && y !== undefined
      ? { x, y }
      : (() => {
          const b = penanda.get(kode)?.el.getBoundingClientRect();
          return b
            ? { x: b.left + b.width / 2 - kanvas.left, y: b.bottom - kanvas.top }
            : { x: 0, y: 0 };
        })();
  tip.style.left = `${Math.min(Math.max(8, pos.x + 14), kanvas.width - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(pos.y + 14, kanvas.height - tip.offsetHeight - 8)}px`;
}
function sembunyiTip(): void {
  $('#tip-peta').hidden = true;
  if (sorotan && peta.getSource('kec'))
    peta.setFeatureState({ source: 'kec', id: sorotan }, { sorot: false });
  sorotan = '';
}
peta.on('mousemove', 'kec-isi', (e) => {
  const kode = e.features?.[0]?.properties?.kode as string | undefined;
  if (kode) tampilTip(kode, e.point.x, e.point.y);
  peta.getCanvas().style.cursor = 'pointer';
});
peta.on('mouseleave', 'kec-isi', () => {
  sembunyiTip();
  peta.getCanvas().style.cursor = '';
});
peta.on('click', 'kec-isi', (e) => {
  const kode = e.features?.[0]?.properties?.kode as string | undefined;
  if (kode) pilihKecamatan(kode);
});
peta.on('click', 'sekolah-titik', (e) => {
  const f = e.features?.[0];
  if (!f) return;
  const p = f.properties as { npsn: string; nama: string; jenjang: string; status: string };
  new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
    .setLngLat((f.geometry as Point).coordinates as [number, number])
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

/** Mewarnai peta, label angka, legenda, dan peringkat menurut indikator aktif. */
function terapkanPeta(): void {
  const i = keadaan.aktif;
  if (!i) return;
  keadaan.batas = batasKelas(
    keadaan.kecamatan.map((k) => i.nilai[k.kode] ?? null),
    5,
  );
  if (peta.getSource('kec')) {
    for (const k of keadaan.kecamatan) {
      const v = i.nilai[k.kode] ?? null;
      peta.setFeatureState(
        { source: 'kec', id: k.kode },
        {
          ada: v !== null,
          kelas: v === null ? 0 : kelasDari(v, keadaan.batas),
          pilih: k.kode === keadaan.kec,
          redup: Boolean(keadaan.kec) && k.kode !== keadaan.kec,
        },
      );
    }
  }
  for (const [kode, p] of penanda) {
    p.angka.textContent = fmtPil(i, i.nilai[kode]);
    p.el.classList.toggle('aktif', kode === keadaan.kec);
    p.el.classList.toggle('redup', Boolean(keadaan.kec) && kode !== keadaan.kec);
    p.el.setAttribute('aria-label', `Kecamatan ${namaKec(kode)}: ${fmt(i, i.nilai[kode])}`);
  }
  $('.peta-kanvas').classList.toggle('dengan-nama', peta.getZoom() >= 9.6 || Boolean(keadaan.kec));
  gambarLegenda(i);
  gambarPeringkat(i);
}

function gambarLegenda(i: Indikator): void {
  const w = warnaKelas();
  const nilai = keadaan.kecamatan
    .map((k) => i.nilai[k.kode])
    .filter((x): x is number => x !== null && x !== undefined);
  const jumlahKelas = keadaan.batas.length + 1;
  isi(
    $('#legenda'),
    h(
      'p',
      { class: 'legenda__judul' },
      i.nama,
      persen(i) ? null : h('span', null, ` (${i.satuan})`),
    ),
    nilai.length
      ? [
          h(
            'div',
            { class: 'legenda__bar', 'aria-hidden': 'true' },
            Array.from({ length: jumlahKelas }, (_, k) =>
              h('span', { style: { background: w[k] ?? '' } }),
            ),
          ),
          h(
            'div',
            { class: 'legenda__ujung' },
            h('span', null, `Rendah ${fmtRingkas(i, Math.min(...nilai))}`),
            h('span', null, `Tinggi ${fmtRingkas(i, Math.max(...nilai))}`),
          ),
        ]
      : h('p', { class: 'sumber' }, 'Belum ada data per kecamatan.'),
    nilai.length < keadaan.kecamatan.length
      ? h('p', { class: 'legenda__kosong' }, h('i', { 'aria-hidden': 'true' }), 'Tidak ada data')
      : null,
  );
}

function gambarPeringkat(i: Indikator): void {
  const baris = urutKecamatan(i);
  const tampil = keadaan.semuaPeringkat ? baris : baris.slice(0, 5);
  const maks = Math.max(1e-9, ...baris.map((b) => Math.abs(b.v ?? 0)));
  $('#teks-judul-peringkat').textContent =
    i.arah === 'turun_baik'
      ? 'Kecamatan terbaik (terendah)'
      : i.arah === 'naik_baik'
        ? 'Kecamatan terbaik'
        : 'Kecamatan tertinggi';
  isi(
    $('#daftar-peringkat'),
    tampil.map((b) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            class: 'peringkat__baris',
            'aria-pressed': String(b.kode === keadaan.kec),
            onclick: () => pilihKecamatan(b.kode),
          },
          h('span', { class: 'peringkat__no' }, b.v === null ? '–' : `#${peringkat(i, b.kode)}`),
          h('span', { class: 'peringkat__nama' }, b.nama),
          h('span', { class: 'peringkat__nilai angka' }, fmtRingkas(i, b.v)),
          h(
            'span',
            { class: 'peringkat__bar', 'aria-hidden': 'true' },
            h('span', { style: { width: `${b.v === null ? 0 : (100 * Math.abs(b.v)) / maks}%` } }),
          ),
        ),
      ),
    ),
  );
  const tombol = $('#tombol-semua');
  tombol.textContent = keadaan.semuaPeringkat
    ? 'Tampilkan 5 teratas'
    : `Lihat semua (${baris.length})`;
  tombol.setAttribute('aria-expanded', String(keadaan.semuaPeringkat));
  $('#panel-peringkat').classList.toggle('semua', keadaan.semuaPeringkat);
}

/* ------------------------------ Panel kanan ------------------------------ */

function gambarInfo(): void {
  const k = keadaan.kecamatan.find((x) => x.kode === keadaan.kec);
  const wilayah = keadaan.indikator.filter((i) => i.kategori === TEMA_PROFIL);
  const dasar = keadaan.indikator.find(
    (i) => i.rincianKabupaten?.penyebut && i.unitPenyebut === 'desa',
  );
  const jumlahDesa = k ? dasar?.rincian?.[k.kode]?.penyebut : dasar?.rincianKabupaten?.penyebut;
  isi(
    $('#kartu-info'),
    h(
      'div',
      { class: 'kartu-info__kepala' },
      h('span', { class: 'kartu-info__ikon' }, ikon('Wilayah')),
      h(
        'div',
        null,
        h('p', { class: 'label-kecil' }, k ? 'Kecamatan terpilih' : 'Info umum wilayah'),
        h('h2', null, k ? k.nama : 'Kabupaten Pesisir Barat'),
        h(
          'p',
          { class: 'kartu-info__sub' },
          k
            ? `${jumlahDesa ? `${formatAngka(jumlahDesa)} desa/kelurahan` : 'Dibandingkan dengan kabupaten'}`
            : `${formatAngka(keadaan.kecamatan.length)} kecamatan${jumlahDesa ? ` · ${formatAngka(jumlahDesa)} desa/kelurahan` : ''}`,
        ),
      ),
      k
        ? h(
            'button',
            {
              type: 'button',
              class: 'tombol-ikon',
              'aria-label': 'Tutup kecamatan, kembali ke kabupaten',
              title: 'Kembali ke kabupaten',
              onclick: () => lepasKecamatan(),
            },
            h(
              'svg',
              { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
              h('path', {
                d: 'M6 6l12 12M18 6 6 18',
                stroke: 'currentColor',
                'stroke-width': '2',
                'stroke-linecap': 'round',
              }),
            ),
          )
        : null,
    ),
    wilayah.length
      ? h(
          'div',
          { class: 'fakta' },
          wilayah.map((i) => {
            const v = k ? (i.nilai[k.kode] ?? null) : i.kabupaten;
            return h(
              'button',
              {
                type: 'button',
                class: 'fakta__butir',
                'aria-pressed': String(i.id === keadaan.aktif?.id),
                title: `${i.nama}: tampilkan di peta`,
                onclick: () => pilihIndikator(i.id),
              },
              h('strong', { class: 'angka' }, fmtRingkas(i, v)),
              h('span', null, LABEL_FAKTA[i.id] ?? i.nama),
            );
          }),
        )
      : null,
    k
      ? h(
          'a',
          { class: 'kartu-info__tautan', href: `/kecamatan/?kode=${k.kode}` },
          'Lihat profil lengkap kecamatan',
        )
      : null,
  );
}

function gambarTab(): void {
  const tema = urutkanTema(keadaan.indikator.map((i) => i.kategori)).filter(
    (t) => t !== TEMA_PROFIL,
  );
  isi(
    $('#tab-tema'),
    tema.map((t) =>
      h(
        'button',
        {
          type: 'button',
          class: 'tab',
          'aria-pressed': String(t === keadaan.tema),
          onclick: () => {
            keadaan.tema = t;
            const pertama = keadaan.indikator.find((i) => i.kategori === t);
            if (pertama && keadaan.aktif?.kategori !== t) keadaan.aktif = pertama;
            perbarui();
          },
        },
        ikon(t, 'tab__ikon'),
        h('span', null, LABEL_TAB[t] ?? t),
      ),
    ),
  );
}

function gambarKartu(): void {
  const k = keadaan.kec;
  const daftar = keadaan.indikator.filter((i) => i.kategori === keadaan.tema);
  if (!daftar.length) {
    isi(
      $('#daftar-indikator'),
      kosong('Belum ada indikator', 'Tema ini belum memiliki indikator.'),
    );
    return;
  }
  isi(
    $('#daftar-indikator'),
    daftar.map((i) => {
      const v = k ? (i.nilai[k] ?? null) : i.kabupaten;
      const r = k ? i.rincian?.[k] : i.rincianKabupaten;
      const nilaiKec = keadaan.kecamatan
        .map((x) => i.nilai[x.kode])
        .filter((x): x is number => x !== null && x !== undefined);
      const lebar =
        v === null ? 0 : persen(i) ? Math.min(100, v) : (100 * v) / Math.max(1e-9, ...nilaiKec, v);
      const b = k ? banding(i, v) : null;
      const no = k ? peringkat(i, k) : null;
      const defId = `def-${i.id}`;
      return h(
        'article',
        { class: `kartu${i.id === keadaan.aktif?.id ? ' kartu--aktif' : ''}`, 'data-id': i.id },
        h(
          'button',
          {
            type: 'button',
            class: 'kartu__utama',
            'aria-pressed': String(i.id === keadaan.aktif?.id),
            onclick: () => pilihIndikator(i.id),
          },
          h('span', { class: 'kartu__ikon' }, ikon(i.kategori)),
          h(
            'span',
            { class: 'kartu__isi' },
            h('span', { class: 'kartu__nama' }, i.nama),
            h(
              'span',
              { class: 'kartu__nilai angka' },
              v === null || v === undefined
                ? 'Tidak ada data'
                : [formatAngka(v, i.desimal), persen(i) ? '%' : h('small', null, i.satuan)],
            ),
            h('span', { class: 'kartu__rinci' }, r ? rinci(i, r) : labelSumber(i)),
            h(
              'span',
              { class: 'kartu__bar', 'aria-hidden': 'true' },
              h('span', { style: { width: `${Math.max(0, lebar)}%` } }),
            ),
            k
              ? h(
                  'span',
                  { class: 'kartu__banding' },
                  b ? h('span', { class: `lencana-arah lencana-arah--${b.kelas}` }, b.teks) : null,
                  h('span', { class: 'kartu__kab' }, `Kab. ${fmtRingkas(i, i.kabupaten)}`),
                  no
                    ? h(
                        'span',
                        { class: 'kartu__no' },
                        `Peringkat ${no}/${keadaan.kecamatan.length}`,
                      )
                    : null,
                )
              : null,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'kartu__info',
            'aria-expanded': 'false',
            'aria-controls': defId,
            'aria-label': `Penjelasan ${i.nama}`,
            title: 'Penjelasan indikator',
            onclick: (e: Event) => {
              const t = e.currentTarget as HTMLElement;
              const buka = t.getAttribute('aria-expanded') !== 'true';
              t.setAttribute('aria-expanded', String(buka));
              $(`#${defId}`).hidden = !buka;
            },
          },
          h(
            'svg',
            { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
            h('circle', {
              cx: '12',
              cy: '12',
              r: '9',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.6',
            }),
            h('path', {
              d: 'M12 11v5M12 8v.01',
              stroke: 'currentColor',
              'stroke-width': '2',
              'stroke-linecap': 'round',
            }),
          ),
        ),
        h(
          'div',
          { class: 'kartu__definisi', id: defId, hidden: true },
          h('p', null, i.metode),
          h(
            'p',
            { class: 'sumber' },
            `Sumber: ${i.sumber}, ${i.tahun}.`,
            i.diperbarui ? ` Diperbarui ${formatTanggal(i.diperbarui)}.` : '',
            i.arah === 'naik_baik'
              ? ' Makin tinggi makin baik.'
              : i.arah === 'turun_baik'
                ? ' Makin rendah makin baik.'
                : '',
          ),
        ),
      );
    }),
  );
}

function gambarChip(): void {
  const wadah = $('#chip-pilihan');
  const k = keadaan.kecamatan.find((x) => x.kode === keadaan.kec);
  wadah.hidden = !k;
  if (!k) return isi(wadah);
  isi(
    wadah,
    h('span', { class: 'label-kecil' }, 'Dipilih'),
    h('strong', null, `Kec. ${k.nama}`),
    h(
      'button',
      {
        type: 'button',
        'aria-label': `Hapus pilihan Kecamatan ${k.nama}`,
        onclick: () => lepasKecamatan(),
      },
      h(
        'svg',
        { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        h('path', {
          d: 'M7 7l10 10M17 7 7 17',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
        }),
      ),
    ),
  );
}

/* ------------------------------ Aksi ------------------------------ */

function simpanUrl(): void {
  const u = new URL(location.href);
  for (const [k, v] of [
    ['tema', keadaan.tema],
    ['ind', keadaan.aktif?.id ?? ''],
    ['kec', keadaan.kec],
  ] as const) {
    if (v) u.searchParams.set(k, v);
    else u.searchParams.delete(k);
  }
  history.replaceState(null, '', u);
}

function perbarui(): void {
  gambarInfo();
  gambarTab();
  gambarKartu();
  gambarChip();
  terapkanPeta();
  simpanUrl();
}

function pilihIndikator(id: string): void {
  const i = keadaan.indikator.find((x) => x.id === id);
  if (!i) return;
  keadaan.aktif = i;
  if (i.kategori !== TEMA_PROFIL) keadaan.tema = i.kategori;
  perbarui();
  if (sempit()) $('.peta-kanvas').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bboxFitur(f: FiturKec): [[number, number], [number, number]] {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  const cincin =
    f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  for (const r of cincin)
    for (const [x, y] of r as [number, number][]) {
      a = Math.min(a, x);
      b = Math.min(b, y);
      c = Math.max(c, x);
      d = Math.max(d, y);
    }
  return [
    [a, b],
    [c, d],
  ];
}
const gerak = (): number =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;

function pilihKecamatan(kode: string): void {
  if (!keadaan.kecamatan.some((k) => k.kode === kode)) return;
  keadaan.kec = kode;
  sembunyiTip();
  perbarui();
  const f = keadaan.fitur.get(kode);
  if (f) peta.fitBounds(bboxFitur(f), { padding: paddingPeta(), maxZoom: 11, duration: gerak() });
}

function lepasKecamatan(): void {
  keadaan.kec = '';
  perbarui();
  peta.fitBounds(BATAS_BBOX, { padding: paddingPeta(), duration: gerak() });
}

/* ------------------------------ Kontrol peta ------------------------------ */

function pasangKontrol(): void {
  $('#k-besar').addEventListener('click', () => peta.zoomIn());
  $('#k-kecil').addEventListener('click', () => peta.zoomOut());
  $('#k-awal').addEventListener('click', () => lepasKecamatan());
  $('#k-penuh').addEventListener('click', () => {
    const app = $('.peta-app');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void app.requestFullscreen?.().catch(() => undefined);
  });
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => peta.resize()));
  const bersih = $('#k-bersih');
  bersih.addEventListener('click', () => {
    const aktif = bersih.getAttribute('aria-pressed') !== 'true';
    bersih.setAttribute('aria-pressed', String(aktif));
    $('.peta-app').classList.toggle('bersih', aktif);
    requestAnimationFrame(() => {
      peta.resize();
      if (!keadaan.kec) peta.fitBounds(BATAS_BBOX, { padding: paddingPeta(), duration: gerak() });
    });
  });
  const lapisan = $('#k-lapisan');
  const pop = $('#popover-lapisan');
  lapisan.addEventListener('click', () => {
    const buka = pop.hidden;
    pop.hidden = !buka;
    lapisan.setAttribute('aria-expanded', String(buka));
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node) && !lapisan.contains(e.target as Node)) {
      pop.hidden = true;
      lapisan.setAttribute('aria-expanded', 'false');
    }
  });
  $('#tombol-semua').addEventListener('click', () => {
    keadaan.semuaPeringkat = !keadaan.semuaPeringkat;
    if (keadaan.aktif) gambarPeringkat(keadaan.aktif);
  });

  const jenjang = $('#filter-jenjang') as HTMLSelectElement;
  for (const j of JENJANG) jenjang.appendChild(h('option', { value: j }, j));
  isi(
    $('#legenda-sekolah'),
    Object.entries(WARNA_JENJANG).map(([j, w]) =>
      h('li', null, h('i', { style: { background: w } }), j),
    ),
  );
  const cek = $('#tampil-sekolah') as HTMLInputElement;
  cek.addEventListener('change', () => void tampilkanSekolah(cek.checked));
  jenjang.addEventListener('change', () => void tampilkanSekolah(cek.checked));
}

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
        `${formatAngka(semuaTitik.features.length)} sekolah berkoordinat layak tampil.`;
    } catch (e) {
      isi($('#catatan-titik'), galat(e));
      return;
    }
  }
  (peta.getSource('sekolah') as GeoJSONSource).setData(semuaTitik);
  const j = ($('#filter-jenjang') as HTMLSelectElement).value;
  peta.setFilter('sekolah-titik', j ? ['==', ['get', 'jenjang'], j] : null);
}

/* ------------------------------ Pencarian (Ctrl K) ------------------------------ */

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
    input.value = '';
    if (li.dataset.ind) pilihIndikator(li.dataset.ind);
    else if (li.dataset.kec) pilihKecamatan(li.dataset.kec);
    else if (li.dataset.npsn)
      location.href = `/sekolah/profil/?npsn=${encodeURIComponent(li.dataset.npsn)}`;
  };
  const kelompok = (judul: string, isiLi: HTMLElement[]): HTMLElement[] =>
    isiLi.length
      ? [h('li', { class: 'hasil-cari__judul', role: 'presentation' }, judul), ...isiLi]
      : [];
  input.addEventListener('input', () => {
    clearTimeout(tunda);
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) return tutup();
    tunda = window.setTimeout(async () => {
      const ind = keadaan.indikator
        .filter((i) => `${i.nama} ${i.kategori}`.toLowerCase().includes(q))
        .slice(0, 6);
      const kec = keadaan.kecamatan.filter((k) => k.nama.toLowerCase().includes(q));
      let sek: { npsn: string; nama: string; jenjang: string; kode_kec: string }[] = [];
      try {
        sek = (await get<{ items: typeof sek }>(`/sekolah${qs({ q, ukuran: 5 })}`)).items;
      } catch {
        /* pencarian sekolah opsional */
      }
      const opsi = [
        ...kelompok(
          'Indikator',
          ind.map((i) =>
            h('li', { role: 'option', 'data-ind': i.id }, i.nama, h('small', null, i.kategori)),
          ),
        ),
        ...kelompok(
          'Kecamatan',
          kec.map((k) => h('li', { role: 'option', 'data-kec': k.kode }, `Kecamatan ${k.nama}`)),
        ),
        ...kelompok(
          'Sekolah',
          sek.map((s) =>
            h(
              'li',
              { role: 'option', 'data-npsn': s.npsn },
              s.nama,
              h('small', null, `${s.jenjang}, Kec. ${namaKec(s.kode_kec)}`),
            ),
          ),
        ),
      ];
      isi(
        daftar,
        opsi.length
          ? opsi
          : h(
              'li',
              { class: 'hasil-cari__kosong', role: 'presentation' },
              `Tidak ada hasil untuk "${input.value.trim()}".`,
            ),
      );
      daftar.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    const items = [...daftar.querySelectorAll<HTMLElement>('li[role=option]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      aktif = (aktif + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === aktif)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const li = items[aktif >= 0 ? aktif : 0];
      if (li) pilih(li);
    } else if (e.key === 'Escape') tutup();
  });
  daftar.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[role=option]');
    if (li) pilih(li);
  });
  $('#cari-peta').addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('click', (e) => {
    if (!$('#cari-peta').contains(e.target as Node)) tutup();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
    }
  });
}

/* ------------------------------ Mulai ------------------------------ */

async function mulai(): Promise<void> {
  pasangPencarian();
  pasangKontrol();
  isi($('#daftar-indikator'), kerangka(5));
  let data: [{ indikator: Indikator[] }, Awaited<ReturnType<typeof situs>>, FeatureCollection];
  try {
    data = await Promise.all([
      get<{ indikator: Indikator[] }>('/indikator'),
      situs(),
      fetch('/data/kecamatan.geojson').then((r) => r.json() as Promise<FeatureCollection>),
    ]);
  } catch (e) {
    isi(
      $('#daftar-indikator'),
      galat(e, () => void mulai()),
    );
    return;
  }
  const [{ indikator }, s, batas] = data;
  keadaan.indikator = indikator;
  keadaan.kecamatan = s.kecamatan;
  for (const f of batas.features as FiturKec[]) keadaan.fitur.set(f.properties.kode, f);
  $('#sumber-batas').textContent = s.pengaturan.sumber_batas_wilayah ?? '';
  if (!indikator.length) {
    isi(
      $('#daftar-indikator'),
      kosong('Belum ada indikator', 'Indikator tampil setelah pengelola menerbitkannya.'),
    );
    return;
  }
  const tema = urutkanTema(indikator.map((i) => i.kategori)).filter((t) => t !== TEMA_PROFIL);
  const awal = indikator.find((i) => i.id === url.get('ind'));
  if (!tema.includes(keadaan.tema))
    keadaan.tema = awal && awal.kategori !== TEMA_PROFIL ? awal.kategori : (tema[0] ?? '');
  keadaan.aktif = awal ?? indikator.find((i) => i.kategori === keadaan.tema) ?? indikator[0]!;
  if (keadaan.kec && !keadaan.kecamatan.some((k) => k.kode === keadaan.kec)) keadaan.kec = '';
  perbarui();
  void pasangPenanda().catch(() => undefined);
  if (peta.isStyleLoaded()) pasangLapisan();
  if (keadaan.kec) {
    const f = keadaan.fitur.get(keadaan.kec);
    if (f) peta.fitBounds(bboxFitur(f), { padding: paddingPeta(), maxZoom: 11, duration: 0 });
  }
}

void mulai();
