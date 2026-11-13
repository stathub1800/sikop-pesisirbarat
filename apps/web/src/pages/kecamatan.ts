/**
 * Profil kecamatan (perbaikan R04: judulnya "Profil Kecamatan", bukan "PROFIL DESA").
 *
 * Urutan baca pimpinan:
 *   1. Ringkasan  : tiga keunggulan dan tiga tantangan dibanding kabupaten (penanda awal).
 *   2. Tabel      : semua indikator per tema, angka kecamatan, kabupaten, sumber, dan kalimat penjelasan.
 *   3. Sekolah    : banyaknya sekolah menurut jenjang dan status.
 * Tombol "Cetak / simpan PDF" menghasilkan profil siap rapat lewat dialog cetak peramban.
 */
import { formatAngka, formatTanggal, isKodeKecamatan, JENJANG, urutkanTema } from '@sikop/shared';
import '../styles/sekolah.css';
import { get } from '../lib/api.ts';
import { $, h } from '../lib/dom.ts';
import {
  fmt,
  ikon,
  konteksJumlah,
  narasi,
  rinci,
  ringkasanKecamatan,
  type ButirRingkasan,
  type Indikator,
  type Kecamatan,
} from '../lib/indikator.ts';
import { gambarPeta } from '../lib/peta-pesisir.ts';
import { situs } from '../lib/situs.ts';
import { kosong, muat } from '../lib/ui.ts';
import { mulaiHalaman, param } from '../lib/umum.ts';

interface Profil {
  kecamatan: { kode: string; kode_kemendagri: string; nama: string; luas_km2_peta: number };
  rekap: { jenjang: string; status: string; sekolah: number }[];
  sumber_batas: string;
}

mulaiHalaman();
const kode = param('kode');

function butirRingkasan(b: ButirRingkasan, k: Kecamatan, semua: Kecamatan[]): HTMLElement {
  const i = b.indikator;
  return h(
    'li',
    null,
    h(
      'a',
      { href: `/peta/?ind=${i.id}&kec=${k.kode}` },
      h('span', { class: 'ringkasan__ikon' }, ikon(i.kategori)),
      h(
        'span',
        { class: 'ringkasan__isi' },
        h('strong', null, i.nama),
        h(
          'span',
          null,
          `${fmt(i, b.nilai)}; kabupaten ${fmt(i, i.kabupaten)}. Peringkat ${b.peringkat} dari ${semua.length}${b.seri > 1 ? ` (sama dengan ${b.seri - 1} kecamatan lain)` : ''}.`,
        ),
      ),
    ),
  );
}

function bagianRingkasan(indikator: Indikator[], semua: Kecamatan[], k: Kecamatan): HTMLElement {
  const { keunggulan, tantangan } = ringkasanKecamatan(indikator, semua, k.kode);
  const kolom = (judul: string, kelas: string, daftar: ButirRingkasan[], kosongTeks: string) =>
    h(
      'div',
      { class: `ringkasan__kolom ringkasan__kolom--${kelas}` },
      h('h3', null, judul),
      daftar.length
        ? h(
            'ol',
            null,
            daftar.map((b) => butirRingkasan(b, k, semua)),
          )
        : h('p', { class: 'teks-redup' }, kosongTeks),
    );
  return h(
    'section',
    { class: 'panel ringkasan', 'aria-labelledby': 'j-ringkasan' },
    h('h2', { id: 'j-ringkasan' }, `Ringkasan untuk pimpinan: Kecamatan ${k.nama}`),
    h(
      'p',
      { class: 'teks-redup' },
      'Disusun otomatis dari indikator yang arah baiknya jelas (makin tinggi atau makin rendah makin baik). Keunggulan: kecamatan termasuk tiga terbaik dan lebih baik dari angka kabupaten. Tantangan: termasuk tiga terburuk dan lebih buruk dari angka kabupaten. Peringkat 1 berarti terbaik di antara 11 kecamatan. Ini penanda awal untuk ditelusuri, bukan penilaian kinerja.',
    ),
    h(
      'div',
      { class: 'ringkasan__grid' },
      kolom(
        'Keunggulan',
        'baik',
        keunggulan,
        'Belum ada indikator yang menempatkan kecamatan ini di tiga teratas sekaligus di atas kabupaten.',
      ),
      kolom(
        'Tantangan',
        'buruk',
        tantangan,
        'Tidak ada indikator yang menempatkan kecamatan ini di tiga terbawah sekaligus di bawah kabupaten.',
      ),
    ),
  );
}

function tampil(p: Profil, indikator: Indikator[], semua: Kecamatan[]): HTMLElement {
  const k = p.kecamatan;
  const wilayah = `Kecamatan ${k.nama}`;
  document.title = `${wilayah} | SIKOP Pesisir Barat`;
  $('#remah-nama').textContent = wilayah;
  const petaWadah = h('div', { class: 'peta-kecil', style: { maxWidth: '320px' } });
  void gambarPeta({
    judul: `Letak Kecamatan ${k.nama} di Kabupaten Pesisir Barat`,
    sorot: k.kode,
    tautan: (x) => `/kecamatan/?kode=${x}`,
  })
    .then((s) => petaWadah.appendChild(s))
    .catch(() => undefined);

  const perJenjang = JENJANG.map((j) => {
    const r = p.rekap.filter((x) => x.jenjang === j);
    const sum = (st?: string): number =>
      r.filter((x) => !st || x.status === st).reduce((a, x) => a + x.sekolah, 0);
    return { j, negeri: sum('Negeri'), swasta: sum('Swasta'), sekolah: sum() };
  }).filter((x) => x.sekolah > 0);
  const tot = perJenjang.reduce(
    (a, x) => ({
      negeri: a.negeri + x.negeri,
      swasta: a.swasta + x.swasta,
      sekolah: a.sekolah + x.sekolah,
    }),
    { negeri: 0, swasta: 0, sekolah: 0 },
  );
  const tema = urutkanTema(indikator.map((i) => i.kategori));
  const rincianKolom = (i: Indikator): string => {
    const v = i.nilai[k.kode] ?? null;
    const jml = konteksJumlah(i, v, semua.length);
    if (jml?.porsi !== null && jml?.porsi !== undefined)
      return `${formatAngka(jml.porsi, 1)}% dari total kabupaten`;
    return rinci(i, i.rincian?.[k.kode]);
  };

  return h(
    'article',
    { class: 'profil-kecamatan' },
    h(
      'div',
      { class: 'dua-kolom' },
      h(
        'div',
        null,
        h('h1', null, wilayah),
        h(
          'p',
          { class: 'halaman__judul' },
          `Kode wilayah BPS ${k.kode}. Luas menurut batas peta sekitar ${formatAngka(k.luas_km2_peta, 0)} km² (indikatif).`,
        ),
        h(
          'div',
          { class: 'baris-tombol tanpa-cetak' },
          h(
            'a',
            { class: 'tombol tombol--primer', href: `/sekolah/?kec=${k.kode}` },
            `Lihat ${formatAngka(tot.sekolah)} sekolah`,
          ),
          h('a', { class: 'tombol', href: `/peta/?kec=${k.kode}` }, 'Buka di Peta Tematik'),
          h(
            'button',
            { type: 'button', class: 'tombol', onclick: () => window.print() },
            'Cetak / simpan PDF',
          ),
        ),
        h(
          'p',
          { class: 'sumber hanya-cetak' },
          `Profil dicetak dari SIKOP BPS Kabupaten Pesisir Barat pada ${formatTanggal(new Date().toISOString())}. ${location.origin}/kecamatan/?kode=${k.kode}`,
        ),
      ),
      petaWadah,
    ),
    bagianRingkasan(indikator, semua, { kode: k.kode, nama: k.nama }),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-ind' },
      h(
        'div',
        { class: 'panel__kepala' },
        h('h2', { id: 'j-ind' }, 'Profil lintas tema'),
        h(
          'div',
          { class: 'baris-tombol tanpa-cetak' },
          h('a', { href: '/tabel/' }, 'Susun tabel sendiri'),
          h(
            'a',
            { href: '/api/v1/indikator/ekspor.csv', download: true },
            'Unduh semua kecamatan (CSV)',
          ),
        ),
      ),
      h(
        'p',
        { class: 'teks-redup' },
        'Semua indikator SIKOP untuk kecamatan ini, dikelompokkan per tema. Kalimat di bawah nama indikator menjelaskan arti angkanya. Data Podes disajikan sebagai agregat kecamatan.',
      ),
      h(
        'div',
        { class: 'tabel-wadah', style: { maxHeight: 'none' } },
        h(
          'table',
          { class: 'tabel-profil' },
          h('caption', { class: 'sr' }, `Indikator ${wilayah} dibandingkan kabupaten`),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { scope: 'col' }, 'Indikator'),
              h('th', { scope: 'col', class: 'kanan' }, k.nama),
              h('th', { scope: 'col', class: 'kanan sembunyi-hp' }, 'Rincian'),
              h('th', { scope: 'col', class: 'kanan' }, 'Kabupaten'),
              h('th', { scope: 'col', class: 'sembunyi-hp' }, 'Sumber'),
            ),
          ),
          tema.map((t) =>
            h(
              'tbody',
              null,
              h('tr', null, h('th', { scope: 'rowgroup', colspan: 5, class: 'baris-kelompok' }, t)),
              indikator
                .filter((i) => i.kategori === t)
                .map((i) => {
                  const kalimat = narasi(i, wilayah, k.kode);
                  return h(
                    'tr',
                    null,
                    h(
                      'th',
                      { scope: 'row', style: { fontWeight: '500' } },
                      h('a', { href: `/peta/?ind=${i.id}&kec=${k.kode}` }, i.nama),
                      kalimat ? h('span', { class: 'narasi-baris' }, kalimat) : null,
                    ),
                    h('td', { class: 'kanan angka' }, fmt(i, i.nilai[k.kode] ?? null)),
                    h('td', { class: 'kanan angka sembunyi-hp teks-redup' }, rincianKolom(i)),
                    h('td', { class: 'kanan angka' }, fmt(i, i.kabupaten)),
                    h('td', { class: 'sembunyi-hp' }, `${i.sumber}, ${i.tahun}`),
                  );
                }),
            ),
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-rekap' },
      h('h2', { id: 'j-rekap' }, 'Sekolah menurut jenjang'),
      perJenjang.length === 0
        ? h('p', null, 'Belum ada data sekolah untuk kecamatan ini.')
        : h(
            'div',
            { class: 'tabel-wadah', style: { maxHeight: 'none' } },
            h(
              'table',
              null,
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  ['Jenjang', 'Negeri', 'Swasta', 'Jumlah sekolah'].map((t, i) =>
                    h('th', { scope: 'col', class: i ? 'kanan' : null }, t),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                perJenjang.map((r) =>
                  h(
                    'tr',
                    null,
                    h(
                      'th',
                      { scope: 'row', style: { fontWeight: '500' } },
                      h(
                        'a',
                        { href: `/sekolah/?kec=${k.kode}&jenjang=${encodeURIComponent(r.j)}` },
                        r.j,
                      ),
                    ),
                    [r.negeri, r.swasta, r.sekolah].map((v) =>
                      h('td', { class: 'kanan angka' }, formatAngka(v)),
                    ),
                  ),
                ),
              ),
              h(
                'tfoot',
                null,
                h(
                  'tr',
                  null,
                  h('td', null, 'Jumlah'),
                  [tot.negeri, tot.swasta, tot.sekolah].map((v) =>
                    h('td', { class: 'kanan angka' }, formatAngka(v)),
                  ),
                ),
              ),
            ),
          ),
      h(
        'p',
        { class: 'sumber' },
        'Jumlah peserta didik dan guru per sekolah sementara tidak ditayangkan karena data sumbernya belum lengkap.',
      ),
    ),
    h('p', { class: 'sumber' }, p.sumber_batas),
  );
}

if (!isKodeKecamatan(kode)) {
  $('#profil-kec').appendChild(
    kosong(
      'Kecamatan tidak ditemukan',
      'Pilih kecamatan dari peta atau daftar di beranda.',
      h('a', { class: 'tombol', href: '/' }, 'Ke beranda'),
    ),
  );
} else {
  void muat(
    $('#profil-kec'),
    () =>
      Promise.all([
        get<Profil>(`/kecamatan/${kode}`),
        get<{ indikator: Indikator[] }>('/indikator'),
        situs(),
      ]),
    ([p, { indikator }, s]) => tampil(p, indikator, s.kecamatan),
    8,
  );
}
