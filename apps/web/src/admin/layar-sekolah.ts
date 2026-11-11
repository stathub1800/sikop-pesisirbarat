import {
  formatTanggal,
  KECAMATAN,
  KOORDINAT_LABEL,
  KOORDINAT_STATUS,
  parseCsv,
  type KoordinatStatus,
} from '@sikop/shared';
import { get, kirim, qs } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import { lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import {
  angka,
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

const NAMA_KEC = Object.fromEntries(KECAMATAN.map((k) => [k.kode, k.nama]));
const WARNA_KOORD: Record<KoordinatStatus, 'hijau' | 'kuning' | 'oranye' | 'merah' | ''> = {
  valid: 'hijau',
  diperbaiki: 'kuning',
  beda_kecamatan: 'oranye',
  di_luar_batas: 'merah',
  tidak_ada: '',
};

interface Baris {
  npsn: string;
  nama: string;
  jenjang: string;
  status: string;
  kode_kec: string;
  koordinat_status: KoordinatStatus;
  is_published: number;
  updated_at: string;
  updated_by: string;
}

export async function layarSekolah(k: Konteks): Promise<void> {
  const p = paramHash();
  const f = {
    q: p.get('q') ?? '',
    kec: p.get('kec') ?? '',
    koordinat: p.get('koordinat') ?? '',
    tayang: p.get('tayang') ?? '',
    halaman: Number(p.get('halaman') ?? 1),
  };
  const r = await get<{ items: Baris[]; total: number; halaman: number; ukuran: number }>(
    `/admin/sekolah${qs({ ...f, ukuran: 25 })}`,
  );
  const form = h(
    'form',
    { class: 'saringan', role: 'search' },
    teks('q', 'Nama atau NPSN', f.q),
    pilihan(
      'kec',
      'Kecamatan',
      [['', 'Semua'], ...KECAMATAN.map((x) => [x.kode, x.nama] as [string, string])],
      f.kec,
    ),
    pilihan(
      'koordinat',
      'Status koordinat',
      [['', 'Semua'], ...KOORDINAT_STATUS.map((s) => [s, KOORDINAT_LABEL[s]] as [string, string])],
      f.koordinat,
    ),
    pilihan(
      'tayang',
      'Tayang',
      [
        ['', 'Semua'],
        ['1', 'Tayang'],
        ['0', 'Disembunyikan'],
      ],
      f.tayang,
    ),
    h('button', { class: 'tombol', type: 'submit' }, 'Terapkan'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aturParamHash({ ...(bacaForm(form) as Record<string, string>), halaman: 1 });
  });
  isi(
    k.isi,
    h('h1', null, 'Data sekolah'),
    h(
      'p',
      { class: 'isian__bantu' },
      'Pilih sekolah untuk menyunting. Koordinat yang Anda simpan dianggap sudah diverifikasi.',
    ),
    form,
    tabel<Baris>(
      [
        { judul: 'Sekolah', isi: (s) => h('a', { href: `#/sekolah/${s.npsn}` }, s.nama) },
        { judul: 'NPSN', isi: (s) => s.npsn, hp: true },
        { judul: 'Kecamatan', isi: (s) => NAMA_KEC[s.kode_kec] ?? s.kode_kec, hp: true },
        {
          judul: 'Koordinat',
          isi: (s) =>
            lencanaStatus(KOORDINAT_LABEL[s.koordinat_status], WARNA_KOORD[s.koordinat_status]),
        },
        { judul: 'Tayang', isi: (s) => (s.is_published ? 'Ya' : 'Tidak'), hp: true },
        {
          judul: 'Diubah',
          isi: (s) => `${formatTanggal(s.updated_at)} oleh ${s.updated_by}`,
          hp: true,
        },
      ],
      r.items,
      'Daftar sekolah',
    ),
    paginasi(r.total, r.halaman, r.ukuran, (n) => aturParamHash({ ...f, halaman: n })),
  );
}

export async function layarSekolahEdit(k: Konteks): Promise<void> {
  const npsn = k.arg[0]!;
  const { sekolah: s } = await get<{ sekolah: Record<string, string | number | null> }>(
    `/admin/sekolah/${encodeURIComponent(npsn)}`,
  );
  const form = h(
    'form',
    { novalidate: true },
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Identitas'),
      h(
        'div',
        { class: 'grid-isian' },
        teks('nama', 'Nama sekolah', s.nama, { wajib: true }),
        teks('bentuk', 'Bentuk pendidikan', s.bentuk, {
          wajib: true,
          bantu: 'Mis. SD, SMP, TK, KB, MTs, PKBM',
        }),
        pilihan('status', 'Status', ['Negeri', 'Swasta'], s.status),
        teks('akreditasi', 'Akreditasi', s.akreditasi),
        pilihan(
          'kode_kec',
          'Kecamatan',
          KECAMATAN.map((x) => [x.kode, x.nama] as [string, string]),
          s.kode_kec,
        ),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Alamat, kontak, koordinat'),
      h(
        'div',
        { class: 'grid-isian' },
        teks('alamat', 'Alamat', s.alamat),
        teks('dusun', 'Dusun', s.dusun),
        teks('kode_pos', 'Kode pos', s.kode_pos),
        teks('telepon', 'Telepon', s.telepon),
        teks('email', 'Email', s.email),
        teks('website', 'Situs', s.website, { bantu: 'Diawali http:// atau https://' }),
        angka('lat', 'Lintang', s.lat, {
          langkah: 'any',
          bantu: 'Contoh -5,2378 (bernilai negatif)',
        }),
        angka('lon', 'Bujur', s.lon, { langkah: 'any', bantu: 'Contoh 103,9575' }),
      ),
      h(
        'p',
        null,
        'Status koordinat saat ini: ',
        lencanaStatus(
          KOORDINAT_LABEL[s.koordinat_status as KoordinatStatus],
          WARNA_KOORD[s.koordinat_status as KoordinatStatus],
        ),
      ),
      s.koordinat_catatan ? h('p', { class: 'isian__bantu' }, String(s.koordinat_catatan)) : null,
      s.lat !== null
        ? h(
            'a',
            {
              href: `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`,
              target: '_blank',
              rel: 'noopener',
            },
            'Periksa titik di OpenStreetMap',
          )
        : null,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Angka pokok'),
      h(
        'div',
        { class: 'grid-isian' },
        angka('pd_l', 'Peserta didik laki-laki', s.pd_l, { min: 0 }),
        angka('pd_p', 'Peserta didik perempuan', s.pd_p, { min: 0 }),
        angka('rombel', 'Rombongan belajar', s.rombel, { min: 0 }),
        angka('guru_l', 'Guru laki-laki', s.guru_l, { min: 0 }),
        angka('guru_p', 'Guru perempuan', s.guru_p, { min: 0 }),
        angka('rk_baik', 'Ruang kelas baik', s.rk_baik, { min: 0 }),
        angka('rk_rusak_ringan', 'Rusak ringan', s.rk_rusak_ringan, { min: 0 }),
        angka('rk_rusak_sedang', 'Rusak sedang', s.rk_rusak_sedang, { min: 0 }),
        angka('rk_rusak_berat', 'Rusak berat', s.rk_rusak_berat, { min: 0 }),
      ),
      h(
        'p',
        { class: 'isian__bantu' },
        'Jumlah peserta didik dan guru dihitung otomatis dari laki-laki + perempuan.',
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      centang('is_published', 'Tayangkan di situs publik', Boolean(s.is_published)),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan perubahan'),
        h('a', { class: 'tombol', href: '#/sekolah' }, 'Kembali'),
      ),
      h(
        'p',
        { class: 'isian__bantu jarak-atas' },
        `Versi ${s.version}, terakhir diubah ${formatTanggal(String(s.updated_at), true)} oleh ${s.updated_by}.`,
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { ...bacaForm(form, true), version: s.version };
    await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        await kirim('PUT', `/admin/sekolah/${encodeURIComponent(npsn)}`, data);
        toast('Perubahan tersimpan.', 'berhasil');
        location.hash = '#/sekolah';
      } catch (err) {
        tampilkanGalatForm(form, err);
      }
    });
  });
  isi(
    k.isi,
    h('nav', { class: 'remah' }, h('a', { href: '#/sekolah' }, 'Data sekolah'), ` / ${s.npsn}`),
    h('h1', null, String(s.nama)),
    form,
  );
}

/** Impor CSV: diurai di browser, dikirim per 100 baris; server memvalidasi ulang tiap baris. */
export async function layarImpor(k: Konteks): Promise<void> {
  const input = h('input', {
    type: 'file',
    accept: '.csv,text/csv',
    id: 'berkas-csv',
  }) as HTMLInputElement;
  const hasil = h('div', { 'aria-live': 'polite' });
  const tombol = h(
    'button',
    { class: 'tombol tombol--primer', type: 'button', disabled: true },
    'Impor',
  ) as HTMLButtonElement;
  let baris: Record<string, string>[] = [];
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024)
      return void toast('Berkas terlalu besar (maksimal 5 MB).', 'galat');
    baris = parseCsv(await f.text());
    const wajib = ['npsn', 'nama_sekolah', 'kecamatan', 'status_sekolah', 'jml_peserta_didik'];
    const kurang = wajib.filter((x) => !(x in (baris[0] ?? {})));
    if (kurang.length) {
      tombol.disabled = true;
      isi(
        hasil,
        h(
          'p',
          { class: 'pesan pesan--galat' },
          `Kolom wajib tidak ditemukan: ${kurang.join(', ')}. Gunakan format ekspor yang sama dengan berkas data sumber.`,
        ),
      );
      return;
    }
    tombol.disabled = false;
    isi(
      hasil,
      h(
        'p',
        { class: 'pesan' },
        `${baris.length} baris siap diimpor dari ${f.name}. Data sekolah dengan NPSN yang sama akan diperbarui.`,
      ),
    );
  });
  tombol.addEventListener(
    'click',
    () =>
      void sibuk(tombol, async () => {
        let tersimpan = 0;
        const temuan: {
          npsn: string;
          baris: number;
          tingkat: string;
          kolom: string;
          pesan: string;
        }[] = [];
        for (let i = 0; i < baris.length; i += 100) {
          const r = await kirim<{ tersimpan: number; temuan: typeof temuan }>(
            'POST',
            '/admin/sekolah/impor',
            { baris: baris.slice(i, i + 100), mulai: i + 2 },
          );
          tersimpan += r.tersimpan;
          temuan.push(...r.temuan);
          isi(
            hasil,
            h(
              'p',
              { class: 'pesan' },
              `Memproses ${Math.min(i + 100, baris.length)} dari ${baris.length} baris…`,
            ),
          );
        }
        const galat = temuan.filter((t) => t.tingkat === 'galat');
        isi(
          hasil,
          h(
            'p',
            { class: `pesan ${galat.length ? 'pesan--peringatan' : 'pesan--berhasil'}` },
            `${tersimpan} sekolah tersimpan. ${galat.length} baris ditolak, ${temuan.length - galat.length} peringatan.`,
          ),
          temuan.length
            ? tabel<(typeof temuan)[number]>(
                [
                  { judul: 'Baris', isi: (t) => t.baris },
                  { judul: 'NPSN', isi: (t) => t.npsn },
                  { judul: 'Tingkat', isi: (t) => t.tingkat },
                  { judul: 'Kolom', isi: (t) => t.kolom },
                  { judul: 'Pesan', isi: (t) => t.pesan },
                ],
                temuan.slice(0, 300),
                'Temuan impor',
              )
            : null,
        );
      }),
  );
  isi(
    k.isi,
    h('h1', null, 'Impor CSV sekolah'),
    h(
      'section',
      { class: 'panel' },
      h(
        'p',
        null,
        'Unggah ekspor data sekolah dengan kolom yang sama seperti berkas sumber. Setiap baris divalidasi dengan aturan yang sama dengan pipeline data: jumlah peserta didik dan guru harus sama dengan laki-laki + perempuan, kecamatan harus dikenali, dan koordinat diperiksa terhadap wilayah kabupaten.',
      ),
      h(
        'p',
        { class: 'pesan pesan--peringatan' },
        'Untuk pembaruan besar (misalnya data semester baru), lebih disarankan memakai pipeline GitHub Actions agar uji titik dalam wilayah dan laporan mutu ikut dijalankan.',
      ),
      h('div', { class: 'isian' }, h('label', { for: 'berkas-csv' }, 'Berkas CSV'), input),
      tombol,
      hasil,
    ),
  );
}
