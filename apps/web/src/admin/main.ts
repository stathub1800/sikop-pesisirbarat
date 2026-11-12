/**
 * Panel admin SIKOP (SPA berbasis hash). Menu disaring per peran; otorisasi sesungguhnya tetap
 * diperiksa server untuk setiap permintaan (menu hanya kenyamanan, bukan kontrol keamanan).
 */
import { LABEL_PERAN, type Peran } from '@sikop/shared';
import '../styles/tokens.css';
import '../styles/dasar.css';
import '../styles/komponen.css';
import '../styles/admin.css';
import { keluar, saya, tombolMasuk, type Akun } from '../lib/akun.ts';
import { ApiError } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import { galat, kerangka } from '../lib/ui.ts';
import { layarDasbor } from './layar-dasbor.ts';
import { layarIndikator, layarIndikatorEdit } from './layar-indikator.ts';
import {
  layarKursus,
  layarModulEdit,
  layarPeserta,
  layarSertifikat,
  layarSoal,
  layarSoalEdit,
} from './layar-lms.ts';
import { layarPermohonan, layarPermohonanDetail } from './layar-permohonan.ts';
import { layarPenyusun, layarPratinjau } from './layar-penyusun.ts';
import { layarImpor, layarSekolah, layarSekolahEdit } from './layar-sekolah.ts';
import { layarAudit, layarPengaturan, layarPengguna } from './layar-sistem.ts';

export interface Konteks {
  akun: Akun & { peran: Peran };
  isi: HTMLElement;
  /** Bagian path setelah nama layar, mis. "#/sekolah/10803624" → ["10803624"]. */
  arg: string[];
}
type Layar = (k: Konteks) => Promise<void>;

interface Menu {
  hash: string;
  label: string;
  peran: Peran[];
  kelompok: string;
}
const MENU: Menu[] = [
  {
    hash: 'dasbor',
    label: 'Dasbor',
    peran: ['editor_data', 'pengelola_lms', 'petugas_pst'],
    kelompok: 'Umum',
  },
  { hash: 'permohonan', label: 'Permohonan data', peran: ['petugas_pst'], kelompok: 'Layanan' },
  { hash: 'sekolah', label: 'Data sekolah', peran: ['editor_data'], kelompok: 'Data' },
  { hash: 'impor', label: 'Impor CSV sekolah', peran: ['editor_data'], kelompok: 'Data' },
  { hash: 'indikator', label: 'Indikator', peran: ['editor_data'], kelompok: 'Data' },
  {
    hash: 'kursus',
    label: 'Kursus dan modul',
    peran: ['pengelola_lms'],
    kelompok: 'Ruang belajar',
  },
  {
    hash: 'penyusun',
    label: 'Penyusun kursus',
    peran: ['pengelola_lms'],
    kelompok: 'Ruang belajar',
  },
  { hash: 'soal', label: 'Bank soal', peran: ['pengelola_lms'], kelompok: 'Ruang belajar' },
  { hash: 'peserta', label: 'Peserta', peran: ['pengelola_lms'], kelompok: 'Ruang belajar' },
  { hash: 'sertifikat', label: 'Sertifikat', peran: ['pengelola_lms'], kelompok: 'Ruang belajar' },
  {
    hash: 'pengaturan',
    label: 'Pengaturan situs',
    peran: ['editor_data', 'pengelola_lms'],
    kelompok: 'Sistem',
  },
  { hash: 'pengguna', label: 'Pengguna admin', peran: [], kelompok: 'Sistem' },
  { hash: 'audit', label: 'Jejak audit', peran: [], kelompok: 'Sistem' },
];

const LAYAR: Record<string, Layar> = {
  dasbor: layarDasbor,
  sekolah: (k) => (k.arg[0] ? layarSekolahEdit(k) : layarSekolah(k)),
  impor: layarImpor,
  indikator: (k) => (k.arg[0] ? layarIndikatorEdit(k) : layarIndikator(k)),
  permohonan: (k) => (k.arg[0] ? layarPermohonanDetail(k) : layarPermohonan(k)),
  kursus: layarKursus,
  penyusun: layarPenyusun,
  pratinjau: layarPratinjau,
  modul: layarModulEdit,
  soal: (k) => (k.arg[0] ? layarSoalEdit(k) : layarSoal(k)),
  peserta: layarPeserta,
  sertifikat: layarSertifikat,
  pengaturan: layarPengaturan,
  pengguna: layarPengguna,
  audit: layarAudit,
};

const boleh = (peran: Peran, m: Pick<Menu, 'peran'>): boolean =>
  peran === 'superadmin' || m.peran.includes(peran);

async function mulai(): Promise<void> {
  const isiUtama = $('#isi');
  isi(isiUtama, kerangka(6));
  const s = await saya();
  if (!s.akun) return halamanMasuk(isiUtama);
  if (!s.akun.peran) {
    isi(
      isiUtama,
      h(
        'section',
        { class: 'panel' },
        h('h1', null, 'Tidak ada akses admin'),
        h(
          'p',
          null,
          `Akun ${s.akun.email} belum diberi peran pengelola. Hubungi superadmin SIKOP.`,
        ),
        h(
          'div',
          { class: 'baris-tombol' },
          h('a', { class: 'tombol', href: '/' }, 'Ke situs publik'),
          h(
            'button',
            { class: 'tombol tombol--polos', type: 'button', onclick: () => void keluar() },
            'Keluar',
          ),
        ),
      ),
    );
    return;
  }
  const akun = s.akun as Akun & { peran: Peran };
  isi(
    $('#admin-akun'),
    h(
      'span',
      null,
      akun.nama,
      ' ',
      h('span', { class: 'lencana lencana--biru' }, LABEL_PERAN[akun.peran]),
    ),
    h(
      'button',
      { class: 'tombol tombol--kecil', type: 'button', onclick: () => void keluar() },
      'Keluar',
    ),
  );

  const menu = MENU.filter((m) => boleh(akun.peran, m));
  const kelompok = [...new Set(menu.map((m) => m.kelompok))];
  isi(
    $('#admin-nav'),
    kelompok.map((g) => [
      h('h2', null, g),
      h(
        'ul',
        null,
        menu
          .filter((m) => m.kelompok === g)
          .map((m) => h('li', null, h('a', { href: `#/${m.hash}`, 'data-hash': m.hash }, m.label))),
      ),
    ]),
  );

  const rute = async (): Promise<void> => {
    const jalur = (location.hash.replace(/^#\/?/, '').split('?')[0] ?? '')
      .split('/')
      .map(decodeURIComponent);
    const [nama = 'dasbor', ...arg] = jalur;
    const induk = nama === 'modul' ? 'kursus' : nama === 'pratinjau' ? 'penyusun' : nama;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('#admin-nav a')) {
      if (a.dataset.hash === induk) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const m = MENU.find((x) => x.hash === induk);
    const layar = LAYAR[nama];
    if (!layar || (m && !boleh(akun.peran, m))) {
      isi(
        isiUtama,
        h(
          'section',
          { class: 'panel' },
          h('h1', null, 'Halaman tidak tersedia'),
          h('p', null, 'Halaman ini tidak ada atau tidak termasuk wewenang peran Anda.'),
          h('a', { class: 'tombol', href: `#/${menu[0]?.hash ?? 'dasbor'}` }, 'Kembali'),
        ),
      );
      return;
    }
    isi(isiUtama, kerangka(8));
    try {
      await layar({ akun, isi: isiUtama, arg });
      isiUtama.focus({ preventScroll: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return void location.reload();
      isi(
        isiUtama,
        galat(e, () => void rute()),
      );
    }
  };
  window.addEventListener('hashchange', () => void rute());
  if (!location.hash) location.hash = `#/${menu[0]?.hash ?? 'dasbor'}`;
  else void rute();
}

function halamanMasuk(wadah: HTMLElement): void {
  const tempat = h('div', { class: 'baris-tombol jarak-atas' });
  isi(
    wadah,
    h(
      'section',
      { class: 'panel', style: { maxWidth: '520px', margin: 'var(--s-7) auto' } },
      h('h1', null, 'Masuk ke panel admin'),
      h(
        'p',
        null,
        'Gunakan akun Google yang telah didaftarkan superadmin. Aktifkan verifikasi dua langkah di akun Google Anda.',
      ),
      tempat,
    ),
  );
  void tombolMasuk(tempat, () => location.reload());
}

void mulai().catch((e) => isi($('#isi'), galat(e)));
