/**
 * Daftar sekolah: saringan, urutan, paginasi. Semua status saringan ada di URL (dapat dibagikan,
 * tombol kembali browser berfungsi). Pencarian ditunda 300 ms agar tidak membanjiri server.
 */
import { formatAngka, formatTanggal, JENJANG } from '@sikop/shared';
import '../styles/sekolah.css';
import { get, qs } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import { situs } from '../lib/situs.ts';
import { galat, kerangka, kosong } from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

interface Baris {
  npsn: string;
  nama: string;
  bentuk: string;
  jenjang: string;
  status: string;
  akreditasi: string | null;
  kode_kec: string;
  pd: number;
  guru: number;
  rombel: number;
}
interface Hasil {
  items: Baris[];
  total: number;
  jumlah_pd: number;
  jumlah_guru: number;
  halaman: number;
  ukuran: number;
}

mulaiHalaman();

const form = $('#filter') as HTMLFormElement;
const FILTER = ['q', 'kec', 'jenjang', 'status', 'akreditasi'] as const;
let namaKec: Record<string, string> = {};
let urut = { kolom: 'nama', arah: 'naik' };
let halaman = 1;

function bacaUrl(): void {
  const u = new URLSearchParams(location.search);
  for (const k of FILTER) {
    const el = form.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = u.get(k) ?? '';
  }
  urut = { kolom: u.get('urut') ?? 'nama', arah: u.get('arah') ?? 'naik' };
  halaman = Math.max(1, Number(u.get('halaman') ?? 1) || 1);
}

function parameter(): Record<string, string> {
  const p: Record<string, string> = {};
  for (const k of FILTER) {
    const v = (form.elements.namedItem(k) as HTMLInputElement).value.trim();
    if (v) p[k] = v;
  }
  return p;
}

async function muatData(dorong = true): Promise<void> {
  const f = parameter();
  const query = qs({ ...f, urut: urut.kolom, arah: urut.arah, halaman, ukuran: 25 });
  if (dorong)
    history.pushState(
      null,
      '',
      location.pathname +
        qs({
          ...f,
          urut: urut.kolom === 'nama' ? '' : urut.kolom,
          arah: urut.arah === 'naik' ? '' : urut.arah,
          halaman: halaman > 1 ? halaman : '',
        }),
    );
  ($('#unduh-csv') as HTMLAnchorElement).href = `/api/v1/sekolah/ekspor.csv${qs(f)}`;
  const wadah = $('#tabel-sekolah');
  wadah.setAttribute('aria-busy', 'true');
  if (!wadah.firstChild) isi(wadah, kerangka(8));
  try {
    const r = await get<Hasil>(`/sekolah${query}`);
    tampil(r);
  } catch (e) {
    isi(
      wadah,
      galat(e, () => void muatData(false)),
    );
  } finally {
    wadah.removeAttribute('aria-busy');
  }
}

const KOLOM: { id: string; label: string; urut?: string; kanan?: boolean; hp?: boolean }[] = [
  { id: 'nama', label: 'Sekolah', urut: 'nama' },
  { id: 'kec', label: 'Kecamatan', urut: 'kecamatan', hp: true },
  { id: 'jenjang', label: 'Jenjang', urut: 'jenjang', hp: true },
  { id: 'status', label: 'Status', hp: true },
  { id: 'akreditasi', label: 'Akreditasi', hp: true },
  { id: 'pd', label: 'Peserta didik', urut: 'pd', kanan: true },
  { id: 'guru', label: 'Guru', urut: 'guru', kanan: true },
];

function tampil(r: Hasil): void {
  const awal = r.total === 0 ? 0 : (r.halaman - 1) * r.ukuran + 1;
  const akhir = Math.min(r.total, r.halaman * r.ukuran);
  $('#ringkas-hasil').textContent =
    r.total === 0
      ? 'Tidak ada sekolah yang cocok.'
      : `Menampilkan ${formatAngka(awal)} sampai ${formatAngka(akhir)} dari ${formatAngka(r.total)} sekolah, dengan ${formatAngka(r.jumlah_pd)} peserta didik dan ${formatAngka(r.jumlah_guru)} guru.`;
  if (r.total === 0) {
    isi(
      $('#tabel-sekolah'),
      kosong(
        'Tidak ada sekolah yang cocok',
        'Ubah atau hapus saringan untuk melihat hasil lain.',
        h('button', { class: 'tombol', type: 'button', onclick: aturUlang }, 'Hapus saringan'),
      ),
    );
    isi($('#paginasi'));
    return;
  }
  const kepala = h(
    'tr',
    null,
    KOLOM.map((k) => {
      const aktif = k.urut && urut.kolom === k.urut;
      return h(
        'th',
        {
          scope: 'col',
          class: [k.kanan ? 'kanan' : '', k.hp ? 'sembunyi-hp' : ''].join(' ').trim() || null,
          'aria-sort': aktif ? (urut.arah === 'naik' ? 'ascending' : 'descending') : null,
        },
        k.urut
          ? h(
              'button',
              { type: 'button', class: 'urut', onclick: () => ubahUrut(k.urut!) },
              k.label,
              h('span', { class: 'sr' }, aktif ? '' : ', urutkan'),
            )
          : k.label,
      );
    }),
  );
  const badan = r.items.map((s) =>
    h(
      'tr',
      null,
      h(
        'td',
        { class: 'nama-sekolah' },
        h('a', { href: `/sekolah/profil/?npsn=${encodeURIComponent(s.npsn)}` }, s.nama),
        h('small', null, `NPSN ${s.npsn}`),
      ),
      h('td', { class: 'sembunyi-hp' }, namaKec[s.kode_kec] ?? s.kode_kec),
      h('td', { class: 'sembunyi-hp' }, s.jenjang),
      h('td', { class: 'sembunyi-hp' }, s.status),
      h('td', { class: 'sembunyi-hp' }, s.akreditasi ?? 'Belum'),
      h('td', { class: 'kanan angka' }, formatAngka(s.pd)),
      h('td', { class: 'kanan angka' }, formatAngka(s.guru)),
    ),
  );
  isi(
    $('#tabel-sekolah'),
    h(
      'div',
      { class: 'tabel-wadah' },
      h(
        'table',
        null,
        h('caption', { class: 'sr' }, 'Daftar sekolah'),
        h('thead', null, kepala),
        h('tbody', null, badan),
      ),
    ),
  );
  const jumlahHal = Math.ceil(r.total / r.ukuran);
  isi(
    $('#paginasi'),
    h('span', null, `Halaman ${r.halaman} dari ${jumlahHal}`),
    h(
      'div',
      { class: 'baris-tombol' },
      h(
        'button',
        {
          class: 'tombol tombol--kecil',
          type: 'button',
          disabled: r.halaman <= 1,
          onclick: () => keHalaman(r.halaman - 1),
        },
        'Sebelumnya',
      ),
      h(
        'button',
        {
          class: 'tombol tombol--kecil',
          type: 'button',
          disabled: r.halaman >= jumlahHal,
          onclick: () => keHalaman(r.halaman + 1),
        },
        'Berikutnya',
      ),
    ),
  );
}

function ubahUrut(kolom: string): void {
  urut =
    urut.kolom === kolom
      ? { kolom, arah: urut.arah === 'naik' ? 'turun' : 'naik' }
      : { kolom, arah: kolom === 'pd' || kolom === 'guru' ? 'turun' : 'naik' };
  halaman = 1;
  void muatData();
}
function keHalaman(n: number): void {
  halaman = n;
  void muatData();
  $('#ringkas-hasil').scrollIntoView({ block: 'start' });
}
function aturUlang(): void {
  form.reset();
  halaman = 1;
  void muatData();
}

async function mulai(): Promise<void> {
  const s = await situs().catch(() => null);
  if (s) {
    namaKec = Object.fromEntries(s.kecamatan.map((k) => [k.kode, k.nama]));
    for (const k of s.kecamatan) $('#f-kec').appendChild(h('option', { value: k.kode }, k.nama));
    $('#sumber-sekolah').textContent =
      `Sumber: ${s.pengaturan.sumber_data_sekolah}, keadaan ${formatTanggal(s.pengaturan.tanggal_data_sekolah)}.`;
  }
  for (const j of JENJANG) $('#f-jenjang').appendChild(h('option', { value: j }, j));
  bacaUrl();
  let tunda = 0;
  form.addEventListener('input', (e) => {
    clearTimeout(tunda);
    halaman = 1;
    tunda = window.setTimeout(
      () => void muatData(),
      (e.target as HTMLElement).tagName === 'INPUT' ? 300 : 0,
    );
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#atur-ulang').addEventListener('click', aturUlang);
  window.addEventListener('popstate', () => {
    bacaUrl();
    void muatData(false);
  });
  await muatData(false);
}

void mulai();
