import { formatTanggal, LABEL_KATEGORI_PERMOHONAN, STATUS_PERMOHONAN } from '@sikop/shared';
import { get, kirim, qs } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import { lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import { area, aturParamHash, bacaForm, paginasi, paramHash, pilihan, tabel, teks } from './kit.ts';
import type { Konteks } from './main.ts';

type Status = (typeof STATUS_PERMOHONAN)[number];
const LABEL: Record<Status, [string, 'biru' | 'kuning' | 'hijau' | 'merah']> = {
  baru: ['Baru', 'biru'],
  diproses: ['Diproses', 'kuning'],
  selesai: ['Selesai', 'hijau'],
  ditolak: ['Ditolak', 'merah'],
};
const katLabel = (k: string): string =>
  LABEL_KATEGORI_PERMOHONAN[k as keyof typeof LABEL_KATEGORI_PERMOHONAN] ?? k;

interface Baris {
  tiket: string;
  nama: string;
  email: string;
  instansi: string | null;
  kategori: string;
  status: Status;
  created_at: string;
  ditangani_oleh: string | null;
}

export async function layarPermohonan(k: Konteks): Promise<void> {
  const p = paramHash();
  const f = {
    status: p.get('status') ?? '',
    q: p.get('q') ?? '',
    halaman: Number(p.get('halaman') ?? 1),
  };
  const r = await get<{
    items: Baris[];
    total: number;
    halaman: number;
    ukuran: number;
    rekap: { status: Status; n: number }[];
  }>(`/admin/permohonan${qs(f)}`);
  const form = h(
    'form',
    { class: 'saringan', role: 'search' },
    pilihan(
      'status',
      'Status',
      [['', 'Semua'], ...STATUS_PERMOHONAN.map((s) => [s, LABEL[s][0]] as [string, string])],
      f.status,
    ),
    teks('q', 'Tiket, nama, atau email', f.q),
    h('button', { class: 'tombol', type: 'submit' }, 'Terapkan'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aturParamHash({ ...(bacaForm(form) as Record<string, string>), halaman: 1 });
  });
  isi(
    k.isi,
    h('h1', null, 'Permohonan data'),
    h(
      'p',
      null,
      r.rekap.map((x) => `${LABEL[x.status][0]}: ${x.n}`).join('. ') || 'Belum ada permohonan.',
    ),
    form,
    r.items.length
      ? tabel<Baris>(
          [
            { judul: 'Tiket', isi: (x) => h('a', { href: `#/permohonan/${x.tiket}` }, x.tiket) },
            { judul: 'Pemohon', isi: (x) => `${x.nama}${x.instansi ? `, ${x.instansi}` : ''}` },
            { judul: 'Jenis', isi: (x) => katLabel(x.kategori), hp: true },
            { judul: 'Diajukan', isi: (x) => formatTanggal(x.created_at, true), hp: true },
            { judul: 'Status', isi: (x) => lencanaStatus(...LABEL[x.status]) },
          ],
          r.items,
          'Daftar permohonan',
        )
      : h('p', { class: 'keadaan' }, 'Tidak ada permohonan yang cocok dengan saringan.'),
    paginasi(r.total, r.halaman, r.ukuran, (n) => aturParamHash({ ...f, halaman: n })),
  );
}

export async function layarPermohonanDetail(k: Konteks): Promise<void> {
  const tiket = k.arg[0]!;
  const { permohonan: p } = await get<{
    permohonan: Baris & {
      no_hp: string | null;
      pesan: string;
      tanggapan: string | null;
      catatan_internal: string | null;
      updated_at: string;
      setuju_privasi_at: string;
      privasi_versi: string;
    };
  }>(`/admin/permohonan/${encodeURIComponent(tiket)}`);
  const form = h(
    'form',
    { novalidate: true },
    pilihan(
      'status',
      'Status',
      STATUS_PERMOHONAN.map((s) => [s, LABEL[s][0]] as [string, string]),
      p.status,
    ),
    area('tanggapan', 'Tanggapan untuk pemohon', p.tanggapan, {
      bantu: 'Tampil ke pemohon saat mengecek status. Wajib diisi saat menutup permohonan.',
    }),
    area('catatan_internal', 'Catatan internal', p.catatan_internal, {
      bantu: 'Hanya terlihat oleh petugas.',
    }),
    h(
      'div',
      { class: 'baris-tombol' },
      h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan'),
      h(
        'a',
        {
          class: 'tombol',
          href: `mailto:${p.email}?subject=${encodeURIComponent(`Tanggapan permohonan ${p.tiket}`)}`,
        },
        'Balas lewat email',
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        await kirim('PUT', `/admin/permohonan/${encodeURIComponent(tiket)}`, bacaForm(form, true));
        toast('Permohonan diperbarui.', 'berhasil');
        location.hash = '#/permohonan';
      } catch (err) {
        tampilkanGalatForm(form, err);
      }
    });
  });
  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah' },
      h('a', { href: '#/permohonan' }, 'Permohonan data'),
      ` / ${p.tiket}`,
    ),
    h('h1', null, p.tiket, ' ', lencanaStatus(...LABEL[p.status])),
    h(
      'div',
      { class: 'dua-kolom' },
      h(
        'section',
        { class: 'panel' },
        h('h2', null, katLabel(p.kategori)),
        h('p', { style: { whiteSpace: 'pre-wrap' } }, p.pesan),
      ),
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Pemohon'),
        h(
          'dl',
          { class: 'dl' },
          h('dt', null, 'Nama'),
          h('dd', null, p.nama),
          h('dt', null, 'Email'),
          h('dd', null, p.email),
          h('dt', null, 'HP'),
          h('dd', null, p.no_hp ?? '–'),
          h('dt', null, 'Instansi'),
          h('dd', null, p.instansi ?? '–'),
          h('dt', null, 'Diajukan'),
          h('dd', null, formatTanggal(p.created_at, true)),
          h('dt', null, 'Persetujuan privasi'),
          h('dd', null, `Versi ${p.privasi_versi}, ${formatTanggal(p.setuju_privasi_at, true)}`),
          h('dt', null, 'Ditangani'),
          h('dd', null, p.ditangani_oleh ?? 'Belum'),
        ),
      ),
    ),
    h('section', { class: 'panel' }, h('h2', null, 'Tindak lanjut'), form),
  );
}
