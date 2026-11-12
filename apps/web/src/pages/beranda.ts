/**
 * Beranda: pintu masuk ringkas (ADR-0006).
 *
 * Urutan baca pimpinan:
 *   1. Pembuka   : apa SIKOP, dua pintu utama (Peta Tematik, Ruang Belajar), isi data saat ini.
 *   2. Sorotan   : satu indikator kunci per tema; kartu yang dipilih mewarnai peta dan peringkat.
 *   3. Perhatian : kecamatan yang paling sering berada di tiga terbawah.
 *   4. Pintu lain: kursus terbaru dan layanan data.
 *   5. Sumber    : seluruh sumber indikator yang tayang.
 * Semua angka dibaca dari API; tidak ada angka tertulis tetap di HTML selain jumlah kecamatan.
 */
import { batasKelas, formatAngka, formatTanggal, kelasDari, urutkanTema } from '@sikop/shared';
import '../styles/beranda.css';
import { get } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import {
  fmt,
  fmtRingkas,
  ikon,
  jumlahSeri,
  LABEL_TAB,
  labelSumber,
  narasi,
  peringkat,
  perluPerhatian,
  rinci,
  TEMA_PROFIL,
  urutKecamatan,
  type Indikator,
  type Kecamatan,
} from '../lib/indikator.ts';
import { gambarPeta, tautkanSorotan } from '../lib/peta-pesisir.ts';
import { situs } from '../lib/situs.ts';
import { galat, kosong } from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

interface Kursus {
  id: string;
  judul: string;
  subjudul: string;
  kategori: string;
  estimasi: string;
  jumlah_modul: number;
}

mulaiHalaman();

/** Indikator kunci per tema. Bila tidak tersedia, dipakai indikator berarah pertama di tema itu. */
const SOROTAN: Record<string, string> = {
  Pendidikan: 'podes_ada_sma',
  Kesehatan: 'podes_faskes_dasar',
  Ekonomi: 'podes_agen_bank',
  Infrastruktur: 'podes_internet_4g',
  Kebencanaan: 'podes_peringatan_tsunami',
  'Tata kelola dan sosial': 'podes_sid',
};

const tautanPeta = (i: Indikator, kec?: string): string => {
  const p = new URLSearchParams({ tema: i.kategori, ind: i.id });
  if (kec) p.set('kec', kec);
  return `/peta/?${p.toString()}`;
};

const keadaan = {
  sorotan: [] as Indikator[],
  aktif: '',
  kecamatan: [] as Kecamatan[],
};

/* ------------------------------ 1. Isi SIKOP ------------------------------ */

function gambarIsiData(indikator: Indikator[]): void {
  const tema = urutkanTema(indikator.map((i) => i.kategori)).filter((t) => t !== TEMA_PROFIL);
  const desa = indikator.find((i) => i.id === 'podes_pesisir')?.rincianKabupaten?.penyebut ?? null;
  const angka: [string, string][] = [
    ['kecamatan', formatAngka(keadaan.kecamatan.length || 11)],
    ['desa dan kelurahan', desa === null ? '–' : formatAngka(desa)],
    ['indikator', formatAngka(indikator.length)],
    ['tema', formatAngka(tema.length)],
  ];
  const dl = $('#isi-data');
  isi(
    dl,
    angka.map(([label, nilai]) => h('div', null, h('dt', null, label), h('dd', null, nilai))),
  );
  dl.removeAttribute('aria-busy');
  const terbaru = indikator
    .map((i) => i.diperbarui)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  $('#isi-data-kaki').textContent = terbaru
    ? `Data terakhir diperbarui ${formatTanggal(terbaru)}.`
    : 'Setiap angka mencantumkan sumber dan tahunnya.';
}

/* ------------------------------ 2. Sorotan lintas tema ------------------------------ */

function pilihSorotan(indikator: Indikator[]): Indikator[] {
  const tema = urutkanTema(indikator.map((i) => i.kategori)).filter((t) => t !== TEMA_PROFIL);
  return tema
    .map(
      (t) =>
        indikator.find((i) => i.id === SOROTAN[t] && i.kategori === t) ??
        indikator.find((i) => i.kategori === t && i.arah !== 'netral') ??
        indikator.find((i) => i.kategori === t),
    )
    .filter((i): i is Indikator => Boolean(i))
    .slice(0, 6);
}

function gambarKartuSorotan(): void {
  isi(
    $('#kartu-sorotan'),
    keadaan.sorotan.map((i) => {
      const r = rinci(i, i.rincianKabupaten);
      return h(
        'button',
        {
          type: 'button',
          class: 'kartu-sorot',
          'data-id': i.id,
          'aria-pressed': String(i.id === keadaan.aktif),
          onclick: () => void aktifkan(i.id, true),
        },
        h(
          'span',
          { class: 'kartu-sorot__tema' },
          ikon(i.kategori),
          LABEL_TAB[i.kategori] ?? i.kategori,
        ),
        h('span', { class: 'kartu-sorot__nama' }, i.nama),
        h('span', { class: 'kartu-sorot__nilai' }, fmtRingkas(i, i.kabupaten)),
        h(
          'span',
          { class: 'kartu-sorot__rinci' },
          r ? `Kabupaten: ${r}` : `Tingkat kabupaten (${i.satuan === '%' ? 'persen' : i.satuan})`,
        ),
      );
    }),
  );
}

async function gambarPetaSorotan(i: Indikator): Promise<void> {
  const wadah = $('#peta-beranda');
  const daftar = $('#daftar-kecamatan');
  const batas = batasKelas(
    keadaan.kecamatan.map((k) => i.nilai[k.kode] ?? null),
    5,
  );
  const kelas = Object.fromEntries(
    keadaan.kecamatan.map((k) => {
      const v = i.nilai[k.kode];
      return [k.kode, v === null || v === undefined ? 0 : kelasDari(v, batas) + 1];
    }),
  );
  const svg = await gambarPeta({
    judul: `Peta ${i.nama} per kecamatan. Pilih kecamatan untuk membukanya di Peta Tematik.`,
    kelas,
    label: (kode, nama) => `${nama}: ${fmt(i, i.nilai[kode])}`,
    tautan: (kode) => tautanPeta(i, kode),
  });
  isi(wadah, svg);
  wadah.removeAttribute('aria-busy');

  // Legenda: warna terang/gelap bergantung pada tema tampilan, jadi arti warna selalu dijelaskan.
  const nilaiAda = keadaan.kecamatan
    .map((k) => i.nilai[k.kode])
    .filter((x): x is number => x !== null && x !== undefined);
  const legenda = $('#legenda-beranda');
  legenda.hidden = !nilaiAda.length;
  if (nilaiAda.length) {
    $('#legenda-rendah').textContent = `Rendah ${fmtRingkas(i, Math.min(...nilaiAda))}`;
    $('#legenda-tinggi').textContent = `Tinggi ${fmtRingkas(i, Math.max(...nilaiAda))}`;
  }

  const baris = urutKecamatan(i, keadaan.kecamatan);
  const ada = baris.filter((b) => b.v !== null).map((b) => b.v!);
  const maks = Math.max(1e-9, ...ada);
  isi(
    daftar,
    baris.map((b) =>
      h(
        'li',
        { 'data-kode': b.kode },
        h(
          'a',
          { href: tautanPeta(i, b.kode) },
          h(
            'span',
            { class: 'daftar-kec__no' },
            b.v === null
              ? '–'
              : `${peringkat(i, keadaan.kecamatan, b.kode)}${jumlahSeri(i, keadaan.kecamatan, b.kode) > 1 ? '=' : ''}`,
          ),
          h('span', { class: 'daftar-kec__nama' }, b.nama),
          h('span', { class: 'angka' }, fmtRingkas(i, b.v)),
          h(
            'span',
            { class: 'daftar-kec__batang', 'aria-hidden': 'true' },
            h('span', {
              style: {
                inlineSize: `${b.v === null ? 0 : Math.max(2, (100 * b.v) / (i.satuan === '%' ? 100 : maks))}%`,
              },
            }),
          ),
        ),
      ),
    ),
  );
  tautkanSorotan(svg, daftar);
}

async function aktifkan(id: string, dariKlik = false): Promise<void> {
  const i = keadaan.sorotan.find((x) => x.id === id);
  if (!i) return;
  keadaan.aktif = id;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.kartu-sorot'))
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  $('#sorotan-tema').replaceChildren(ikon(i.kategori), LABEL_TAB[i.kategori] ?? i.kategori);
  $('#sorotan-nama').textContent = i.nama;
  $('#sorotan-narasi').textContent = narasi(i, 'Kabupaten Pesisir Barat') ?? '';
  const arah =
    i.arah === 'naik_baik'
      ? 'Urutan dari nilai tertinggi.'
      : i.arah === 'turun_baik'
        ? 'Urutan dari nilai terendah (makin rendah makin baik).'
        : 'Urutan dari nilai tertinggi.';
  const adaSeri = keadaan.kecamatan.some(
    (k) => i.nilai[k.kode] !== null && jumlahSeri(i, keadaan.kecamatan, k.kode) > 1,
  );
  $('#sumber-peta').textContent =
    `Kabupaten ${fmt(i, i.kabupaten)}. ${arah}${adaSeri ? ' Tanda "=" berarti beberapa kecamatan bernilai sama.' : ''} Warna peta mengikuti legenda di atas. Sumber: ${labelSumber(i)}.`;
  ($('#buka-sorotan') as HTMLAnchorElement).href = tautanPeta(i);
  await gambarPetaSorotan(i);
  // Pada layar sempit peta berada di bawah kartu: bawa ke peta agar perubahan terlihat.
  if (dariKlik && window.matchMedia('(max-width: 1023px)').matches) {
    const kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('.sorotan__peta').scrollIntoView({
      behavior: kurangiGerak ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}

/* ------------------------------ 3. Perlu perhatian ------------------------------ */

function gambarPerhatian(indikator: Indikator[]): void {
  const daftar = $('#perhatian');
  const hasil = perluPerhatian(
    indikator.filter((i) => i.kategori !== TEMA_PROFIL),
    keadaan.kecamatan,
  ).filter((k) => k.jumlah > 0);
  daftar.removeAttribute('aria-busy');
  if (!hasil.length) {
    isi(daftar, h('li', null, kosong('Belum cukup data', 'Indikator berarah belum tersedia.')));
    return;
  }
  isi(
    daftar,
    hasil.map((k) => {
      // Contoh: satu indikator per tema agar ragam masalahnya terlihat.
      const temaDipakai = new Set<string>();
      const contoh = k.contoh
        .filter((i) => !temaDipakai.has(i.kategori) && temaDipakai.add(i.kategori))
        .slice(0, 3);
      return h(
        'li',
        { class: 'perhatian__item' },
        h(
          'div',
          { class: 'perhatian__kepala' },
          h('h3', null, k.nama),
          h(
            'p',
            { class: 'perhatian__ringkas' },
            h('strong', null, formatAngka(k.jumlah)),
            ` dari ${formatAngka(k.dari)} indikator berarah berada di tiga terbawah`,
          ),
          h(
            'span',
            { class: 'perhatian__meter', 'aria-hidden': 'true' },
            h('span', { style: { inlineSize: `${(100 * k.jumlah) / Math.max(1, k.dari)}%` } }),
          ),
        ),
        h(
          'ul',
          { class: 'perhatian__contoh' },
          contoh.map((i) =>
            h(
              'li',
              null,
              h(
                'a',
                { href: tautanPeta(i, k.kode) },
                ikon(i.kategori),
                h('span', null, i.nama),
                h('span', { class: 'angka' }, fmt(i, i.nilai[k.kode])),
              ),
            ),
          ),
        ),
        h(
          'a',
          { class: 'tautan-panah', href: `/peta/?kec=${k.kode}` },
          `Lihat profil ${k.nama} di peta`,
        ),
      );
    }),
  );
}

/* ------------------------------ 5. Sumber ------------------------------ */

function gambarSumber(indikator: Indikator[]): void {
  const per = new Map<string, number>();
  for (const i of indikator) per.set(labelSumber(i), (per.get(labelSumber(i)) ?? 0) + 1);
  isi(
    $('#pita-sumber'),
    [...per.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) =>
        h('li', null, h('strong', null, s), h('span', null, `${formatAngka(n)} indikator`)),
      ),
  );
}

/* ------------------------------ Muat ------------------------------ */

async function mulaiData(): Promise<void> {
  try {
    const [{ indikator }, s] = await Promise.all([
      get<{ indikator: Indikator[] }>('/indikator'),
      situs(),
    ]);
    keadaan.kecamatan = s.kecamatan;
    gambarIsiData(indikator);
    keadaan.sorotan = pilihSorotan(indikator);
    gambarKartuSorotan();
    if (keadaan.sorotan[0]) await aktifkan(keadaan.sorotan[0].id);
    gambarPerhatian(indikator);
    gambarSumber(indikator);
  } catch (e) {
    isi(
      $('#peta-beranda'),
      galat(e, () => void mulaiData()),
    );
    $('#perhatian').removeAttribute('aria-busy');
  }
}

/**
 * Selama belum ada kursus yang terbit, tombol kedua di pembuka diarahkan ke Layanan Data agar
 * pengunjung tidak diarahkan ke halaman yang masih kosong. Begitu kursus pertama terbit, tombol
 * kembali ke Ruang Belajar dengan sendirinya. Menu Ruang Belajar di kepala halaman tetap ada.
 */
function gantiAksiKedua(): void {
  const a = document.querySelector<HTMLAnchorElement>('#aksi-kedua');
  if (!a) return;
  a.href = '/layanan/';
  a.replaceChildren(
    h(
      'svg',
      { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      h('path', {
        d: 'M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.8',
        'stroke-linejoin': 'round',
      }),
    ),
    'Ajukan permohonan data',
  );
}

async function mulaiKursus(): Promise<void> {
  const wadah = $('#kursus-terbaru');
  try {
    const { kursus } = await get<{ kursus: Kursus[] }>('/lms/kursus');
    wadah.removeAttribute('aria-busy');
    if (!kursus.length) {
      gantiAksiKedua();
      isi(
        wadah,
        h(
          'li',
          null,
          kosong(
            'Sedang dalam tahap pengembangan',
            'Ruang Belajar sedang dikembangkan. Kursus akan diterbitkan bertahap setelah materi dan ujian selesai diuji.',
          ),
        ),
      );
      return;
    }
    isi(
      wadah,
      kursus
        .slice(0, 3)
        .map((k) =>
          h(
            'li',
            null,
            h(
              'a',
              { href: `/belajar/#/kursus/${encodeURIComponent(k.id)}` },
              h('span', { class: 'kursus-ringkas__kategori' }, k.kategori || 'Kursus'),
              h('strong', null, k.judul),
              k.subjudul ? h('span', { class: 'kursus-ringkas__sub' }, k.subjudul) : null,
              h(
                'span',
                { class: 'kursus-ringkas__meta' },
                [`${formatAngka(k.jumlah_modul)} modul`, k.estimasi].filter(Boolean).join(' · '),
              ),
            ),
          ),
        ),
    );
  } catch (e) {
    wadah.removeAttribute('aria-busy');
    isi(
      wadah,
      h(
        'li',
        null,
        galat(e, () => void mulaiKursus()),
      ),
    );
  }
}

void mulaiData();
void mulaiKursus();
