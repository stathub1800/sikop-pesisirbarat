/**
 * Profil kecamatan (perbaikan R04: judulnya "Profil Kecamatan", bukan "PROFIL DESA").
 * Setiap angka ditampilkan berdampingan dengan angka kabupaten dan sumbernya.
 */
import { formatAngka, isKodeKecamatan, JENJANG, urutkanTema } from '@sikop/shared';
import '../styles/sekolah.css';
import { get } from '../lib/api.ts';
import { $, h } from '../lib/dom.ts';
import { gambarPeta } from '../lib/peta-pesisir.ts';
import { kosong, muat } from '../lib/ui.ts';
import { mulaiHalaman, param } from '../lib/umum.ts';

interface Profil {
  kecamatan: { kode: string; kode_kemendagri: string; nama: string; luas_km2_peta: number };
  rekap: { jenjang: string; status: string; sekolah: number; pd: number; guru: number }[];
  indikator: {
    id: string;
    nama: string;
    satuan: string;
    kategori: string;
    sumber: string;
    tahun: string;
    desimal: number;
    nilai: number | null;
    kabupaten: number | null;
    rincian?: { pembilang: number | null; penyebut: number | null } | null;
    unitPenyebut?: string;
  }[];
  sumber_batas: string;
}

mulaiHalaman();
const kode = param('kode');

function tampil(p: Profil): HTMLElement {
  const k = p.kecamatan;
  document.title = `Kecamatan ${k.nama} | SIKOP Pesisir Barat`;
  $('#remah-nama').textContent = `Kecamatan ${k.nama}`;
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
    const sum = (f: 'sekolah' | 'pd' | 'guru', st?: string): number =>
      r.filter((x) => !st || x.status === st).reduce((a, x) => a + x[f], 0);
    return {
      j,
      negeri: sum('sekolah', 'Negeri'),
      swasta: sum('sekolah', 'Swasta'),
      sekolah: sum('sekolah'),
      pd: sum('pd'),
      guru: sum('guru'),
    };
  }).filter((x) => x.sekolah > 0);
  const tot = perJenjang.reduce(
    (a, x) => ({
      negeri: a.negeri + x.negeri,
      swasta: a.swasta + x.swasta,
      sekolah: a.sekolah + x.sekolah,
      pd: a.pd + x.pd,
      guru: a.guru + x.guru,
    }),
    { negeri: 0, swasta: 0, sekolah: 0, pd: 0, guru: 0 },
  );
  const tema = urutkanTema(p.indikator.map((i) => i.kategori));
  const nilaiPenuh = (v: number | null, d: number, sat: string): string =>
    v === null ? '–' : `${formatAngka(v, d)}${sat === '%' ? '%' : ` ${sat}`}`;
  const rinci = (i: Profil['indikator'][number]): string =>
    i.rincian && i.rincian.penyebut !== null
      ? i.satuan === '%'
        ? `${formatAngka(i.rincian.pembilang)} dari ${formatAngka(i.rincian.penyebut)} ${i.unitPenyebut ?? 'desa'}`
        : `median dari ${formatAngka(i.rincian.penyebut)} ${i.unitPenyebut ?? 'desa'}`
      : '';

  return h(
    'article',
    null,
    h(
      'div',
      { class: 'dua-kolom' },
      h(
        'div',
        null,
        h('h1', null, `Kecamatan ${k.nama}`),
        h(
          'p',
          { class: 'halaman__judul' },
          `Kode wilayah BPS ${k.kode}. Luas menurut batas peta sekitar ${formatAngka(k.luas_km2_peta, 0)} km² (indikatif).`,
        ),
        h(
          'div',
          { class: 'baris-tombol' },
          h(
            'a',
            { class: 'tombol tombol--primer', href: `/sekolah/?kec=${k.kode}` },
            `Lihat ${formatAngka(tot.sekolah)} sekolah`,
          ),
          h('a', { class: 'tombol', href: `/peta/?kec=${k.kode}` }, 'Buka di Peta Tematik'),
        ),
      ),
      petaWadah,
    ),
    h(
      'section',
      { class: 'panel', style: { marginTop: 'var(--s-6)' }, 'aria-labelledby': 'j-ind' },
      h(
        'div',
        { class: 'panel__kepala' },
        h('h2', { id: 'j-ind' }, 'Profil lintas tema'),
        h(
          'a',
          { href: '/api/v1/indikator/ekspor.csv', download: true },
          'Unduh semua kecamatan (CSV)',
        ),
      ),
      h(
        'p',
        { class: 'teks-redup' },
        'Semua indikator SIKOP untuk kecamatan ini, dikelompokkan per tema. Data Podes disajikan sebagai agregat kecamatan.',
      ),
      h(
        'div',
        { class: 'tabel-wadah', style: { maxHeight: 'none' } },
        h(
          'table',
          null,
          h('caption', { class: 'sr' }, `Indikator Kecamatan ${k.nama} dibandingkan kabupaten`),
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
              p.indikator
                .filter((i) => i.kategori === t)
                .map((i) =>
                  h(
                    'tr',
                    null,
                    h(
                      'th',
                      { scope: 'row', style: { fontWeight: '500' } },
                      h('a', { href: `/peta/?ind=${i.id}&kec=${k.kode}` }, i.nama),
                    ),
                    h('td', { class: 'kanan angka' }, nilaiPenuh(i.nilai, i.desimal, i.satuan)),
                    h('td', { class: 'kanan angka sembunyi-hp teks-redup' }, rinci(i)),
                    h('td', { class: 'kanan angka' }, nilaiPenuh(i.kabupaten, i.desimal, i.satuan)),
                    h('td', { class: 'sembunyi-hp' }, `${i.sumber}, ${i.tahun}`),
                  ),
                ),
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
                  ['Jenjang', 'Negeri', 'Swasta', 'Jumlah', 'Peserta didik', 'Guru'].map((t, i) =>
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
                    [r.negeri, r.swasta, r.sekolah, r.pd, r.guru].map((v) =>
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
                  [tot.negeri, tot.swasta, tot.sekolah, tot.pd, tot.guru].map((v) =>
                    h('td', { class: 'kanan angka' }, formatAngka(v)),
                  ),
                ),
              ),
            ),
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
  void muat($('#profil-kec'), () => get<Profil>(`/kecamatan/${kode}`), tampil, 8);
}
