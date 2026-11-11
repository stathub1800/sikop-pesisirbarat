import { formatAngka, KECAMATAN } from '@sikop/shared';
import { get, kirim } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import { lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import { angka, area, bacaForm, centang, pilihan, tabel, teks } from './kit.ts';
import type { Konteks } from './main.ts';

interface Ind {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  sumber: string;
  tahun: string;
  jenis: 'otomatis' | 'manual';
  kabupaten: number | null;
  desimal: number;
  is_published?: number;
}
interface Manual {
  id: string;
  sumber: string | null;
  tahun: string | null;
  metode: string | null;
  agregasi: string;
  kabupaten_nilai: number | null;
  is_published: number;
  urutan: number;
  catatan_internal: string | null;
  version: number;
}

export async function layarIndikator(k: Konteks): Promise<void> {
  const r = await get<{ indikator: (Ind & { nilai: Record<string, number | null> })[] }>(
    '/admin/indikator',
  );
  const status = (i: Ind): HTMLElement =>
    i.jenis === 'otomatis'
      ? lencanaStatus('Otomatis, tayang', 'biru')
      : i.is_published
        ? lencanaStatus('Tayang', 'hijau')
        : lencanaStatus('Draf', 'kuning');
  isi(
    k.isi,
    h('h1', null, 'Indikator'),
    h(
      'p',
      null,
      'Indikator otomatis dihitung dari data sekolah setiap kali diminta dan tidak dapat disunting di sini. Indikator manual baru tayang bila sumber, tahun, dan cara hitung sudah diisi.',
    ),
    h(
      'div',
      { class: 'baris-tombol', style: { marginBottom: 'var(--s-4)' } },
      h(
        'a',
        { class: 'tombol tombol--primer', href: '#/indikator/baru' },
        'Tambah indikator manual',
      ),
    ),
    tabel<Ind>(
      [
        {
          judul: 'Indikator',
          isi: (i) =>
            i.jenis === 'manual' ? h('a', { href: `#/indikator/${i.id}` }, i.nama) : i.nama,
        },
        { judul: 'Kategori', isi: (i) => i.kategori, hp: true },
        {
          judul: 'Kabupaten',
          isi: (i) => (i.kabupaten === null ? '–' : formatAngka(i.kabupaten, i.desimal)),
          kanan: true,
        },
        {
          judul: 'Sumber',
          isi: (i) => (i.sumber ? `${i.sumber}, ${i.tahun}` : 'Belum diisi'),
          hp: true,
        },
        { judul: 'Status', isi: status },
      ],
      r.indikator,
      'Daftar indikator',
    ),
  );
}

export async function layarIndikatorEdit(k: Konteks): Promise<void> {
  const id = k.arg[0]!;
  const baru = id === 'baru';
  const r = await get<{
    indikator: (Ind & { nilai: Record<string, number | null>; metode: string; arah: string })[];
    manual: Manual[];
  }>('/admin/indikator');
  const ind = r.indikator.find((x) => x.id === id && x.jenis === 'manual');
  const m = r.manual.find((x) => x.id === id);
  if (!baru && (!ind || !m))
    return void isi(k.isi, h('p', { class: 'pesan pesan--galat' }, 'Indikator tidak ditemukan.'));
  const form = h(
    'form',
    { novalidate: true },
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Keterangan'),
      h(
        'div',
        { class: 'grid-isian' },
        teks('id', 'ID', baru ? '' : id, {
          wajib: true,
          baca: !baru,
          bantu: 'Huruf kecil dan garis bawah, mis. jumlah_penduduk. Tidak dapat diubah.',
        }),
        teks('nama', 'Nama indikator', ind?.nama, { wajib: true }),
        teks('satuan', 'Satuan', ind?.satuan, { wajib: true, bantu: 'Mis. jiwa, unit, %' }),
        teks('kategori', 'Kategori', ind?.kategori, { wajib: true }),
        teks('sumber', 'Sumber', m?.sumber, { bantu: 'Mis. Kecamatan Dalam Angka 2025' }),
        teks('tahun', 'Tahun data', m?.tahun),
        angka('desimal', 'Jumlah desimal', ind?.desimal ?? 0, { min: 0, max: 3 }),
        pilihan(
          'arah',
          'Arah',
          [
            ['netral', 'Netral'],
            ['naik_baik', 'Makin tinggi makin baik'],
            ['turun_baik', 'Makin rendah makin baik'],
          ],
          ind?.arah ?? 'netral',
        ),
        pilihan(
          'agregasi',
          'Angka kabupaten',
          [
            ['jumlah', 'Jumlah semua kecamatan'],
            ['rasio', 'Diisi manual (rasio/persentase)'],
            ['tidak_ada', 'Tidak ditampilkan'],
          ],
          m?.agregasi ?? 'jumlah',
        ),
        angka('kabupaten_nilai', 'Nilai kabupaten (bila diisi manual)', m?.kabupaten_nilai, {
          langkah: 'any',
        }),
        angka('urutan', 'Urutan tampil', m?.urutan ?? 100, { min: 0 }),
      ),
      area('metode', 'Cara hitung', m?.metode, {
        bantu:
          'Jelaskan rumus dan cakupan data agar pengguna dapat menafsirkan angka dengan benar.',
      }),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Nilai per kecamatan'),
      h(
        'div',
        { class: 'grid-nilai' },
        KECAMATAN.map((x) =>
          angka(`nilai.${x.kode}`, x.nama, ind?.nilai[x.kode] ?? null, { langkah: 'any' }),
        ),
      ),
    ),
    h(
      'section',
      { class: 'panel' },
      m?.catatan_internal ? h('p', { class: 'pesan pesan--peringatan' }, m.catatan_internal) : null,
      centang('is_published', 'Tayangkan di situs publik', Boolean(m?.is_published)),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan'),
        h('a', { class: 'tombol', href: '#/indikator' }, 'Batal'),
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = bacaForm(form, true);
    const nilai: Record<string, number | null> = {};
    for (const [key, v] of Object.entries(d))
      if (key.startsWith('nilai.')) nilai[key.slice(6)] = v as number | null;
    const body: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(d).filter(([key]) => !key.startsWith('nilai.'))),
      nilai,
      desimal: d.desimal ?? 0,
      urutan: d.urutan ?? 100,
      version: m?.version ?? 0,
    };
    await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        await kirim('PUT', `/admin/indikator/${encodeURIComponent(String(body.id ?? ''))}`, body);
        toast('Indikator tersimpan.', 'berhasil');
        location.hash = '#/indikator';
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
      h('a', { href: '#/indikator' }, 'Indikator'),
      ` / ${baru ? 'Baru' : id}`,
    ),
    h('h1', null, baru ? 'Indikator baru' : ind!.nama),
    form,
  );
}
