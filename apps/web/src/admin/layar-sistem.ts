import { formatTanggal, LABEL_PERAN, PERAN } from '@sikop/shared';
import { get, kirim, qs } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import { lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import {
  area,
  aturParamHash,
  bacaForm,
  centang,
  paginasi,
  paramHash,
  pilihan,
  tabel,
  teks,
} from './kit.ts';
import type { Konteks } from './main.ts';

/* ------------------------------ Pengaturan ------------------------------ */

export async function layarPengaturan(k: Konteks): Promise<void> {
  const { pengaturan: p } = await get<{ pengaturan: Record<string, string> }>('/admin/pengaturan');
  const bolehSitus = k.akun.peran === 'superadmin' || k.akun.peran === 'editor_data';
  const bolehSert = k.akun.peran === 'superadmin' || k.akun.peran === 'pengelola_lms';

  const simpan = (form: HTMLFormElement, kunci: string[]): void => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = bacaForm(form);
      const body = Object.fromEntries(
        kunci.map((x) => [x, typeof d[x] === 'boolean' ? (d[x] ? '1' : '0') : String(d[x] ?? '')]),
      );
      await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
        try {
          await kirim('PUT', '/admin/pengaturan', body);
          toast('Pengaturan tersimpan.', 'berhasil');
        } catch (err) {
          tampilkanGalatForm(form, err);
        }
      });
    });
  };

  const situs = h(
    'form',
    { novalidate: true },
    h('h2', null, 'Identitas dan kontak'),
    h(
      'div',
      { class: 'grid-isian' },
      teks('nama_singkat', 'Nama singkat', p.nama_singkat),
      teks('kepanjangan', 'Kepanjangan resmi', p.kepanjangan, {
        bantu: 'Gunakan satu kepanjangan yang ditetapkan pimpinan (S09).',
      }),
      teks('nama_instansi', 'Nama instansi', p.nama_instansi),
      teks('alamat', 'Alamat kantor', p.alamat),
      teks('pst_email', 'Email PST', p.pst_email),
      teks('pst_whatsapp', 'WhatsApp PST', p.pst_whatsapp, {
        bantu: 'Format 628xxxxxxxxx. Kosongkan untuk menyembunyikan.',
      }),
      teks('pst_telepon', 'Telepon PST', p.pst_telepon),
      teks('jam_layanan', 'Jam layanan', p.jam_layanan),
      teks('situs_resmi', 'Situs resmi', p.situs_resmi),
      teks('sosmed_instagram', 'Instagram (https)', p.sosmed_instagram),
      teks('sosmed_youtube', 'YouTube (https)', p.sosmed_youtube),
      teks('sosmed_facebook', 'Facebook (https)', p.sosmed_facebook),
      teks('sosmed_x', 'X (https)', p.sosmed_x),
    ),
    h('h2', null, 'Sumber data'),
    h(
      'div',
      { class: 'grid-isian' },
      teks('sumber_data_sekolah', 'Sumber data sekolah', p.sumber_data_sekolah),
      teks('tanggal_data_sekolah', 'Tanggal keadaan data (YYYY-MM-DD)', p.tanggal_data_sekolah),
      teks('privasi_versi', 'Versi kebijakan privasi', p.privasi_versi),
      teks('privasi_tanggal', 'Tanggal berlaku privasi (YYYY-MM-DD)', p.privasi_tanggal),
    ),
    area('sumber_batas_wilayah', 'Keterangan batas wilayah', p.sumber_batas_wilayah),
    area('mitra_json', 'Mitra (JSON)', p.mitra_json, {
      bantu:
        'Contoh: [{"nama":"Bappeda Kabupaten Pesisir Barat","url":"https://..."}]. Hanya mitra nyata yang sudah bekerja sama (T05).',
    }),
    area('tim_json', 'Tim pengelola (JSON)', p.tim_json, {
      bantu: 'Contoh: [{"nama":"Nama Pegawai","peran":"Penanggung jawab data"}]',
    }),
    h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan pengaturan situs'),
  ) as HTMLFormElement;
  simpan(situs, [
    'nama_singkat',
    'kepanjangan',
    'nama_instansi',
    'alamat',
    'pst_email',
    'pst_whatsapp',
    'pst_telepon',
    'jam_layanan',
    'situs_resmi',
    'sosmed_instagram',
    'sosmed_youtube',
    'sosmed_facebook',
    'sosmed_x',
    'sumber_data_sekolah',
    'tanggal_data_sekolah',
    'privasi_versi',
    'privasi_tanggal',
    'sumber_batas_wilayah',
    'mitra_json',
    'tim_json',
  ]);

  const sert = h(
    'form',
    { novalidate: true },
    h('h2', null, 'Sertifikat'),
    h(
      'p',
      { class: 'isian__bantu' },
      'Penandatangan harus pejabat yang sah dan berwenang (T08). Sertifikat tidak terbit selama penerbitan belum diaktifkan.',
    ),
    h(
      'div',
      { class: 'grid-isian' },
      teks('penandatangan_nama', 'Nama penandatangan', p.penandatangan_nama),
      teks('penandatangan_jabatan', 'Jabatan penandatangan', p.penandatangan_jabatan),
      teks('penandatangan_nip', 'NIP penandatangan', p.penandatangan_nip),
    ),
    centang('sertifikat_aktif', 'Aktifkan penerbitan sertifikat', p.sertifikat_aktif === '1'),
    h(
      'div',
      { class: 'jarak-atas' },
      h(
        'button',
        { class: 'tombol tombol--primer', type: 'submit' },
        'Simpan pengaturan sertifikat',
      ),
    ),
  ) as HTMLFormElement;
  simpan(sert, [
    'penandatangan_nama',
    'penandatangan_jabatan',
    'penandatangan_nip',
    'sertifikat_aktif',
  ]);

  isi(
    k.isi,
    h('h1', null, 'Pengaturan situs'),
    bolehSitus ? h('section', { class: 'panel' }, situs) : null,
    bolehSert ? h('section', { class: 'panel' }, sert) : null,
  );
}

/* -------------------------------- Pengguna -------------------------------- */

interface Pengguna {
  email: string;
  nama: string;
  peran: (typeof PERAN)[number];
  is_active: number;
  created_by: string;
  last_login: string | null;
}

/** Penjelasan singkat hak tiap peran; harus sesuai daftar MENU di main.ts. */
const TUGAS_PERAN: Record<(typeof PERAN)[number], string> = {
  superadmin: 'Akses penuh: semua menu, menambah dan mengubah admin, serta melihat jejak audit.',
  editor_data: 'Data sekolah, impor CSV sekolah, indikator Peta Tematik, dan pengaturan situs.',
  pengelola_lms:
    'Kursus dan penyusun kursus, bank soal, verifikasi peserta Ruang Belajar, sertifikat, dan pengaturan situs.',
  petugas_pst: 'Menanggapi permohonan data dari pengunjung (Layanan Data).',
};

export async function layarPengguna(k: Konteks): Promise<void> {
  const { pengguna } = await get<{ pengguna: Pengguna[] }>('/admin/pengguna');
  const form = h(
    'form',
    { novalidate: true },
    h(
      'div',
      { class: 'grid-isian' },
      teks('email', 'Email akun Google', '', { wajib: true }),
      teks('nama', 'Nama', '', { wajib: true }),
      pilihan(
        'peran',
        'Peran',
        PERAN.map((p) => [p, LABEL_PERAN[p]] as [string, string]),
        'editor_data',
      ),
    ),
    centang('is_active', 'Aktif (nonaktifkan untuk mencabut akses tanpa menghapus riwayat)', true),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan pengguna'),
      h('button', { class: 'tombol', type: 'reset' }, 'Kosongkan'),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        await kirim('PUT', '/admin/pengguna', bacaForm(form));
        toast('Pengguna tersimpan.', 'berhasil');
        void layarPengguna(k);
      } catch (err) {
        tampilkanGalatForm(form, err);
      }
    });
  });
  const isiForm = (u: Pengguna): void => {
    (form.elements.namedItem('email') as HTMLInputElement).value = u.email;
    (form.elements.namedItem('nama') as HTMLInputElement).value = u.nama;
    (form.elements.namedItem('peran') as HTMLSelectElement).value = u.peran;
    (form.elements.namedItem('is_active') as HTMLInputElement).checked = Boolean(u.is_active);
    form.scrollIntoView({ behavior: 'smooth' });
  };
  const jumlahPeran = (pr: string): number =>
    pengguna.filter((u) => u.peran === pr && u.is_active).length;
  isi(
    k.isi,
    h('h1', null, 'Admin dan peran'),
    h(
      'p',
      { class: 'isian__bantu' },
      'Tambahkan pegawai yang mengelola situs dengan email akun Google-nya, lalu pilih perannya. Orang tersebut masuk lewat halaman /admin/ dengan akun Google yang sama. Pisahkan tugas: editor data, pengelola ruang belajar, dan petugas PST sebaiknya orang yang berbeda. Perubahan peran berlaku seketika dan mengakhiri sesi pengguna tersebut. Peserta kursus tidak dikelola di sini, tetapi di ',
      h('a', { href: '#/peserta' }, 'Peserta Ruang Belajar'),
      '.',
    ),
    h(
      'ul',
      { class: 'daftar-peran', 'aria-label': 'Peran dan hak akses' },
      PERAN.map((pr) =>
        h(
          'li',
          null,
          h('strong', null, `${LABEL_PERAN[pr]} (${jumlahPeran(pr)} aktif)`),
          h('span', null, TUGAS_PERAN[pr]),
        ),
      ),
    ),
    h('section', { class: 'panel' }, h('h2', null, 'Tambah atau ubah admin'), form),
    h('h2', { class: 'jarak-atas' }, `Daftar admin (${pengguna.length})`),
    tabel<Pengguna>(
      [
        {
          judul: 'Pengguna',
          isi: (u) =>
            h('span', null, h('strong', null, u.nama), h('br'), h('small', null, u.email)),
        },
        { judul: 'Peran', isi: (u) => LABEL_PERAN[u.peran] },
        {
          judul: 'Status',
          isi: (u) =>
            u.is_active ? lencanaStatus('Aktif', 'hijau') : lencanaStatus('Nonaktif', ''),
        },
        {
          judul: 'Login terakhir',
          isi: (u) => (u.last_login ? formatTanggal(u.last_login, true) : 'Belum pernah'),
          hp: true,
        },
        {
          judul: 'Aksi',
          isi: (u) =>
            h(
              'button',
              { class: 'tombol tombol--kecil', type: 'button', onclick: () => isiForm(u) },
              'Ubah',
            ),
        },
      ],
      pengguna,
      'Daftar pengguna admin',
    ),
  );
}

/* -------------------------------- Audit -------------------------------- */

interface Log {
  id: number;
  waktu: string;
  aktor: string;
  peran: string | null;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  sebelum: string | null;
  sesudah: string | null;
  request_id: string | null;
}

export async function layarAudit(k: Konteks): Promise<void> {
  const p = paramHash();
  const f = {
    entitas: p.get('entitas') ?? '',
    aktor: p.get('aktor') ?? '',
    halaman: Number(p.get('halaman') ?? 1),
  };
  const r = await get<{ items: Log[]; total: number; halaman: number; ukuran: number }>(
    `/admin/audit${qs(f)}`,
  );
  const form = h(
    'form',
    { class: 'saringan' },
    pilihan(
      'entitas',
      'Entitas',
      [
        '',
        'sekolah',
        'indikator',
        'pengaturan',
        'permohonan',
        'peserta',
        'sertifikat',
        'soal',
        'modul',
        'kursus',
        'admin_peran',
        'akun',
      ],
      f.entitas,
    ),
    teks('aktor', 'Email pelaku', f.aktor),
    h('button', { class: 'tombol', type: 'submit' }, 'Terapkan'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aturParamHash({ ...(bacaForm(form) as Record<string, string>), halaman: 1 });
  });
  const ringkas = (s: string | null): Node | string => (s ? h('pre', { class: 'kode' }, s) : '–');
  isi(
    k.isi,
    h('h1', null, 'Jejak audit'),
    h(
      'p',
      { class: 'isian__bantu' },
      'Catatan ini tidak dapat diubah atau dihapus oleh siapa pun melalui aplikasi maupun SQL langsung.',
    ),
    form,
    tabel<Log>(
      [
        { judul: 'Waktu', isi: (l) => formatTanggal(l.waktu, true) },
        { judul: 'Pelaku', isi: (l) => `${l.aktor}${l.peran ? ` (${l.peran})` : ''}` },
        {
          judul: 'Aksi',
          isi: (l) => `${l.aksi} ${l.entitas}${l.entitas_id ? ` ${l.entitas_id}` : ''}`,
        },
        { judul: 'Sebelum', isi: (l) => ringkas(l.sebelum), hp: true },
        { judul: 'Sesudah', isi: (l) => ringkas(l.sesudah), hp: true },
      ],
      r.items,
      'Jejak audit',
    ),
    paginasi(r.total, r.halaman, r.ukuran, (n) => aturParamHash({ ...f, halaman: n })),
  );
}
