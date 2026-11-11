import { formatAngka, formatPersen, formatTanggal, titleCase } from '@sikop/shared';
import '../styles/sekolah.css';
import { get } from '../lib/api.ts';
import { $, h } from '../lib/dom.ts';
import { gambarPeta } from '../lib/peta-pesisir.ts';
import { kosong, muat } from '../lib/ui.ts';
import { mulaiHalaman, param } from '../lib/umum.ts';

interface Sekolah {
  npsn: string;
  nama: string;
  bentuk: string;
  jenjang: string;
  status: string;
  akreditasi: string | null;
  alamat: string | null;
  dusun: string | null;
  rt: string | null;
  rw: string | null;
  kode_pos: string | null;
  kode_kec: string;
  kecamatan: string;
  telepon: string | null;
  email: string | null;
  website: string | null;
  yayasan: string | null;
  lat: number | null;
  lon: number | null;
  koordinat_status: string;
  waktu_penyelenggaraan: string | null;
  kurikulum: string | null;
  sumber_listrik: string | null;
  daya_listrik: number | null;
  akses_internet: string | null;
  luas_tanah: number | null;
  pd: number;
  pd_l: number;
  pd_p: number;
  rombel: number;
  guru: number;
  guru_l: number;
  guru_p: number;
  rk_baik: number;
  rk_rusak_ringan: number;
  rk_rusak_sedang: number;
  rk_rusak_berat: number;
}

mulaiHalaman();
const npsn = param('npsn');

const atau = (v: string | number | null | undefined, kosongTeks = 'Belum diisi'): string =>
  v === null || v === undefined || v === '' ? kosongTeks : String(v);

function tampil(s: Sekolah, sumber: string, tanggal: string): HTMLElement {
  document.title = `${s.nama} | SIKOP Pesisir Barat`;
  $('#remah-nama').textContent = s.nama;
  const rk = s.rk_baik + s.rk_rusak_ringan + s.rk_rusak_sedang + s.rk_rusak_berat;
  const kondisi = [
    { n: s.rk_baik, label: 'Baik', warna: 'var(--hijau)' },
    { n: s.rk_rusak_ringan, label: 'Rusak ringan', warna: 'var(--kuning)' },
    { n: s.rk_rusak_sedang, label: 'Rusak sedang', warna: 'var(--oranye)' },
    { n: s.rk_rusak_berat, label: 'Rusak berat', warna: 'var(--merah)' },
  ];
  const alamat = [
    s.alamat,
    s.dusun && `Dusun ${s.dusun}`,
    s.rt && `RT ${s.rt}`,
    s.rw && `RW ${s.rw}`,
    `Kec. ${s.kecamatan}`,
    s.kode_pos,
  ]
    .filter(Boolean)
    .join(', ');
  const petaKecil = h('div', { class: 'peta-kecil' });
  void gambarPeta({ judul: `Lokasi Kecamatan ${s.kecamatan}`, sorot: s.kode_kec, labelLaut: false })
    .then((svg) => petaKecil.appendChild(svg))
    .catch(() => undefined);

  return h(
    'article',
    null,
    h('h1', null, s.nama),
    h(
      'div',
      { class: 'profil-kepala' },
      h('span', { class: 'lencana lencana--biru' }, s.jenjang),
      h('span', { class: 'lencana' }, s.bentuk),
      h('span', { class: 'lencana' }, s.status),
      h(
        'span',
        {
          class: `lencana ${s.akreditasi === 'A' || s.akreditasi === 'B' ? 'lencana--hijau' : ''}`,
        },
        s.akreditasi && s.akreditasi !== 'Tidak Terakreditasi'
          ? `Akreditasi ${s.akreditasi}`
          : 'Belum terakreditasi',
      ),
      h('span', { class: 'lencana' }, `NPSN ${s.npsn}`),
    ),
    h(
      'div',
      { class: 'kpi' },
      h(
        'div',
        null,
        h('span', { class: 'kpi__nilai' }, formatAngka(s.pd)),
        h(
          'span',
          { class: 'kpi__label' },
          `peserta didik (${formatAngka(s.pd_l)} laki-laki, ${formatAngka(s.pd_p)} perempuan)`,
        ),
      ),
      h(
        'div',
        null,
        h('span', { class: 'kpi__nilai' }, formatAngka(s.guru)),
        h(
          'span',
          { class: 'kpi__label' },
          `guru (${formatAngka(s.guru_l)} laki-laki, ${formatAngka(s.guru_p)} perempuan)`,
        ),
      ),
      h(
        'div',
        null,
        h('span', { class: 'kpi__nilai' }, formatAngka(s.rombel)),
        h('span', { class: 'kpi__label' }, 'rombongan belajar'),
      ),
      h(
        'div',
        null,
        h('span', { class: 'kpi__nilai' }, s.guru > 0 ? formatAngka(s.pd / s.guru, 1) : '–'),
        h('span', { class: 'kpi__label' }, 'peserta didik per guru'),
      ),
    ),
    h(
      'div',
      { class: 'dua-kolom', style: { marginTop: 'var(--s-5)' } },
      h(
        'div',
        null,
        h(
          'section',
          { class: 'panel kondisi-kelas', 'aria-labelledby': 'j-kelas' },
          h('h2', { id: 'j-kelas' }, 'Kondisi ruang kelas'),
          rk === 0
            ? h('p', null, 'Data ruang kelas belum dilaporkan.')
            : [
                h(
                  'p',
                  null,
                  `${formatAngka(rk)} ruang kelas, ${formatPersen((s.rk_baik / rk) * 100)} dalam kondisi baik.`,
                ),
                h(
                  'div',
                  {
                    class: 'batang',
                    role: 'img',
                    'aria-label': kondisi.map((k) => `${k.label} ${k.n}`).join(', '),
                  },
                  kondisi
                    .filter((k) => k.n > 0)
                    .map((k) =>
                      h('span', { style: { width: `${(k.n / rk) * 100}%`, background: k.warna } }),
                    ),
                ),
                h(
                  'ul',
                  null,
                  kondisi.map((k) =>
                    h(
                      'li',
                      null,
                      h('i', { style: { background: k.warna } }),
                      `${k.label}: ${formatAngka(k.n)}`,
                    ),
                  ),
                ),
              ],
        ),
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-sarana' },
          h('h2', { id: 'j-sarana' }, 'Sarana dan penyelenggaraan'),
          h(
            'dl',
            { class: 'dl' },
            h('dt', null, 'Kurikulum'),
            h('dd', null, atau(s.kurikulum)),
            h('dt', null, 'Waktu belajar'),
            h('dd', null, atau(s.waktu_penyelenggaraan)),
            h('dt', null, 'Akses internet'),
            h('dd', null, atau(s.akses_internet)),
            h('dt', null, 'Sumber listrik'),
            h(
              'dd',
              null,
              `${atau(s.sumber_listrik)}${s.daya_listrik ? `, ${formatAngka(s.daya_listrik)} VA` : ''}`,
            ),
            h('dt', null, 'Luas tanah'),
            h('dd', null, s.luas_tanah ? `${formatAngka(s.luas_tanah)} m²` : 'Belum diisi'),
            s.yayasan ? [h('dt', null, 'Yayasan'), h('dd', null, titleCase(s.yayasan))] : null,
          ),
        ),
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'j-alamat' },
        h('h2', { id: 'j-alamat' }, 'Alamat dan kontak'),
        h('p', null, alamat),
        h(
          'dl',
          { class: 'dl' },
          h('dt', null, 'Telepon'),
          h(
            'dd',
            null,
            s.telepon
              ? h('a', { href: `tel:${s.telepon.replace(/[^\d+]/g, '')}` }, s.telepon)
              : 'Belum diisi',
          ),
          h('dt', null, 'Email'),
          h('dd', null, s.email ? h('a', { href: `mailto:${s.email}` }, s.email) : 'Belum diisi'),
          h('dt', null, 'Situs'),
          h(
            'dd',
            null,
            s.website
              ? h('a', { href: s.website, rel: 'noopener nofollow', target: '_blank' }, s.website)
              : 'Belum diisi',
          ),
        ),
        petaKecil,
        h(
          'div',
          { class: 'baris-tombol', style: { marginTop: 'var(--s-4)' } },
          s.lat !== null
            ? h(
                'a',
                { class: 'tombol tombol--kecil', href: `/peta/?kec=${s.kode_kec}` },
                'Lihat di peta',
              )
            : h(
                'p',
                { class: 'isian__bantu' },
                'Koordinat sekolah ini belum tersedia atau sedang diverifikasi.',
              ),
          h(
            'a',
            { class: 'tombol tombol--kecil', href: `/kecamatan/?kode=${s.kode_kec}` },
            `Profil Kec. ${s.kecamatan}`,
          ),
        ),
        s.koordinat_status === 'diperbaiki'
          ? h(
              'p',
              { class: 'sumber' },
              'Format koordinat sekolah ini dikoreksi otomatis dan sedang menunggu verifikasi petugas.',
            )
          : null,
      ),
    ),
    h(
      'p',
      { class: 'sumber' },
      `Sumber: ${sumber}, keadaan ${formatTanggal(tanggal)}. Temukan data yang keliru? `,
      h(
        'a',
        {
          href: `/layanan/?perihal=${encodeURIComponent(`Koreksi data ${s.nama} (NPSN ${s.npsn})`)}`,
        },
        'Laporkan ke PST',
      ),
      '.',
    ),
  );
}

if (!/^[0-9A-Za-z]{8}$/.test(npsn)) {
  $('#profil').appendChild(
    kosong(
      'Sekolah tidak ditemukan',
      'Alamat halaman tidak lengkap. Cari sekolah dari daftar.',
      h('a', { class: 'tombol', href: '/sekolah/' }, 'Ke Data Sekolah'),
    ),
  );
} else {
  void muat(
    $('#profil'),
    () =>
      get<{ sekolah: Sekolah; sumber: string; tanggal_data: string }>(
        `/sekolah/${encodeURIComponent(npsn)}`,
      ),
    (r) => tampil(r.sekolah, r.sumber, r.tanggal_data),
    8,
  );
}
