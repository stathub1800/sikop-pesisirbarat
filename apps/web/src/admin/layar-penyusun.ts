/**
 * Penyusun kursus (ADR-0009): struktur bab dan pelajaran, penyunting per jenis materi, soal latihan,
 * kesiapan terbit, riwayat perubahan, dan pratinjau sebagai peserta.
 *
 *   #/penyusun                       daftar kursus
 *   #/penyusun/:kursus               struktur, kesiapan, riwayat
 *   #/penyusun/:kursus/bab/:id       bab (id atau "baru")
 *   #/penyusun/:kursus/pelajaran/:id pelajaran (id atau "baru?bab=ID&jenis=video")
 *   #/pratinjau/:pelajaran           pratinjau sebagai peserta
 */
import {
  idVideoYoutube,
  JENIS_PELAJARAN,
  LABEL_JENIS_PELAJARAN,
  urlEmbedYoutube,
  type JenisPelajaran,
} from '@sikop/shared';
import '../styles/belajar.css';
import { ApiError, get, kirim } from '../lib/api.ts';
import { h, ikon, IKON, isi } from '../lib/dom.ts';
import { tampilPratinjau } from '../lib/belajar-ruang.ts';
import { markdown } from '../lib/markdown.ts';
import { konfirmasi, lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import { angka, area, bacaForm, centang, paramHash, pilihan, tabel, teks } from './kit.ts';
import type { Konteks } from './main.ts';

/* ------------------------------- Tipe ------------------------------- */

interface PelajaranAdmin {
  id: number;
  bab_id: number;
  urutan: number;
  judul: string;
  jenis: JenisPelajaran;
  isi: Record<string, unknown>;
  durasi_menit: number;
  wajib: boolean;
  is_published: boolean;
  version: number;
  jumlah_soal: number;
  jumlah_progres: number;
  updated_by: string;
}
interface BabAdmin {
  id: number;
  kursus_id: string;
  modul_id: number | null;
  modul_judul: string | null;
  modul_terbit: number | null;
  urutan: number;
  judul: string;
  is_published: boolean;
  version: number;
  updated_by: string;
  pelajaran: PelajaranAdmin[];
}
interface Struktur {
  kursus: { id: string; kode: string; judul: string; is_published: number };
  bab: BabAdmin[];
  modul: { id: number; nomor: number; judul: string; is_published: number }[];
}
interface Kesiapan {
  siap: boolean;
  item: { tingkat: 'masalah' | 'peringatan' | 'info'; pesan: string }[];
}
interface Riwayat {
  riwayat: {
    id: number;
    aktor: string;
    aksi: string;
    entitas: string;
    entitas_id: string | null;
    created_at: string;
  }[];
}
interface SoalAdmin {
  id: number;
  urutan: number;
  pertanyaan: string;
  opsi: { id: string; text: string }[];
  kunci: string;
  pembahasan: string | null;
  is_active: boolean;
}

const A = '/admin/lms';
const HURUF = ['A', 'B', 'C', 'D', 'E'] as const;
const IKON_JENIS: Record<JenisPelajaran, string> = {
  video: IKON.video,
  bacaan: IKON.bacaan,
  pdf: IKON.dokumen,
  latihan: IKON.latihan,
};
const waktuWib = (t: string): string =>
  new Date(t).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  });

/** Memindahkan satu elemen ke atas (-1) atau ke bawah (+1) dan mengembalikan urutan id baru. */
export function geser(ids: number[], indeks: number, arah: -1 | 1): number[] | null {
  const ke = indeks + arah;
  if (indeks < 0 || ke < 0 || ke >= ids.length) return null;
  const salinan = [...ids];
  [salinan[indeks], salinan[ke]] = [salinan[ke]!, salinan[indeks]!];
  return salinan;
}

const pesanGalat = (e: unknown): string =>
  e instanceof ApiError
    ? [e.message, ...Object.values(e.rincian).flat()].filter(Boolean).join(' ')
    : 'Terjadi kendala. Coba lagi.';

/* ------------------------------ Router ------------------------------ */

export async function layarPenyusun(k: Konteks): Promise<void> {
  const [kursus, bagian, id] = k.arg;
  if (!kursus) return daftarKursus(k);
  if (bagian === 'bab') return layarBab(k, kursus, id ?? 'baru');
  if (bagian === 'pelajaran') return layarPelajaran(k, kursus, id ?? 'baru');
  return layarStruktur(k, kursus);
}

export async function layarPratinjau(k: Konteks): Promise<void> {
  await tampilPratinjau(k.isi, Number(k.arg[0]));
}

async function daftarKursus(k: Konteks): Promise<void> {
  const r = await get<{
    kursus: { id: string; kode: string; judul: string; is_published: number }[];
  }>(`${A}/kursus`);
  isi(
    k.isi,
    h('h1', null, 'Penyusun kursus'),
    h('p', null, 'Pilih kursus untuk menyusun bab dan pelajarannya.'),
    tabel(
      [
        { judul: 'Kursus', isi: (x) => h('a', { href: `#/penyusun/${x.id}` }, x.judul) },
        { judul: 'Kode', isi: (x) => x.kode, hp: true },
        {
          judul: 'Status',
          isi: (x) =>
            x.is_published ? lencanaStatus('Tayang', 'hijau') : lencanaStatus('Draf', 'kuning'),
        },
      ],
      r.kursus,
      'Daftar kursus',
    ),
  );
}

/* ------------------------------ Struktur ------------------------------ */

async function layarStruktur(k: Konteks, kursusId: string): Promise<void> {
  const [s, kesiapan, riwayat] = await Promise.all([
    get<Struktur>(`${A}/kursus/${encodeURIComponent(kursusId)}/struktur`),
    get<Kesiapan>(`${A}/kursus/${encodeURIComponent(kursusId)}/kesiapan`),
    get<Riwayat>(`${A}/kursus/${encodeURIComponent(kursusId)}/riwayat?batas=20`),
  ]);
  const muat = (): void => void layarPenyusun(k);
  const aksi =
    (fn: () => Promise<unknown>, pesan?: string): (() => void) =>
    () =>
      void fn()
        .then(() => {
          if (pesan) toast(pesan, 'berhasil');
          muat();
        })
        .catch((e: unknown) => toast(pesanGalat(e), 'galat', 8000));

  const urutBab = (i: number, arah: -1 | 1): (() => void) =>
    aksi(async () => {
      const ids = geser(
        s.bab.map((b) => b.id),
        i,
        arah,
      );
      if (ids) await kirim('PUT', `${A}/kursus/${kursusId}/bab/urutan`, { ids });
    });
  const urutPel = (b: BabAdmin, i: number, arah: -1 | 1): (() => void) =>
    aksi(async () => {
      const ids = geser(
        b.pelajaran.map((p) => p.id),
        i,
        arah,
      );
      if (ids) await kirim('PUT', `${A}/bab/${b.id}/pelajaran/urutan`, { ids });
    });
  const terbitBab = (b: BabAdmin): (() => void) =>
    aksi(
      () =>
        kirim('PUT', `${A}/bab/${b.id}`, {
          judul: b.judul,
          modul_id: b.modul_id,
          is_published: !b.is_published,
          version: b.version,
        }),
      b.is_published ? 'Bab dijadikan draf.' : 'Bab diterbitkan.',
    );
  const terbitPel = (p: PelajaranAdmin): (() => void) =>
    aksi(
      () =>
        kirim('PUT', `${A}/pelajaran/${p.id}`, {
          judul: p.judul,
          jenis: p.jenis,
          isi: p.isi,
          durasi_menit: p.durasi_menit,
          wajib: p.wajib,
          is_published: !p.is_published,
          version: p.version,
        }),
      p.is_published ? 'Pelajaran dijadikan draf.' : 'Pelajaran diterbitkan.',
    );
  const hapus =
    (judul: string, url: string, apa: string): (() => void) =>
    () =>
      void konfirmasi(`Hapus ${apa}?`, `"${judul}" akan dihapus permanen.`, 'Hapus').then((ya) => {
        if (ya)
          aksi(() => kirim('DELETE', url), `${apa[0]!.toUpperCase()}${apa.slice(1)} dihapus.`)();
      });

  const tombol = (
    label: string,
    onclick: () => void,
    o: { mati?: boolean; kelas?: string; nama?: string } = {},
  ): HTMLElement =>
    h(
      'button',
      {
        class: `tombol tombol--kecil ${o.kelas ?? ''}`.trim(),
        type: 'button',
        disabled: o.mati,
        'aria-label': o.nama,
        onclick,
      },
      label,
    );

  const barisPelajaran = (b: BabAdmin, p: PelajaranAdmin, i: number): HTMLElement =>
    h(
      'li',
      { class: 'susun-pelajaran', 'data-pelajaran': p.id },
      h('span', { class: 'susun-pelajaran__ikon' }, ikon(IKON_JENIS[p.jenis])),
      h(
        'div',
        { class: 'susun-pelajaran__nama' },
        h('a', { href: `#/penyusun/${s.kursus.id}/pelajaran/${p.id}` }, p.judul),
        h(
          'span',
          { class: 'isian__bantu' },
          [
            LABEL_JENIS_PELAJARAN[p.jenis],
            p.durasi_menit ? `${p.durasi_menit} menit` : '',
            p.wajib ? 'wajib' : 'opsional',
            p.jenis === 'latihan' ? `${p.jumlah_soal} soal` : '',
          ]
            .filter(Boolean)
            .join(', '),
        ),
      ),
      p.is_published ? lencanaStatus('Terbit', 'hijau') : lencanaStatus('Draf', 'kuning'),
      h(
        'div',
        { class: 'susun-aksi' },
        tombol('Naik', urutPel(b, i, -1), { mati: i === 0, nama: `Naikkan ${p.judul}` }),
        tombol('Turun', urutPel(b, i, 1), {
          mati: i === b.pelajaran.length - 1,
          nama: `Turunkan ${p.judul}`,
        }),
        h('a', { class: 'tombol tombol--kecil', href: `#/pratinjau/${p.id}` }, 'Pratinjau'),
        tombol(p.is_published ? 'Jadikan draf' : 'Terbitkan', terbitPel(p), {
          nama: `${p.is_published ? 'Jadikan draf' : 'Terbitkan'} ${p.judul}`,
        }),
        tombol('Hapus', hapus(p.judul, `${A}/pelajaran/${p.id}`, 'pelajaran'), {
          kelas: 'tombol--bahaya',
          nama: `Hapus ${p.judul}`,
        }),
      ),
    );

  const kartuBab = (b: BabAdmin, i: number): HTMLElement =>
    h(
      'section',
      { class: 'panel susun-bab', 'data-bab': b.id, 'aria-label': `Bab ${b.urutan}: ${b.judul}` },
      h(
        'div',
        { class: 'panel__kepala' },
        h(
          'h2',
          null,
          `Bab ${b.urutan}. ${b.judul} `,
          b.is_published ? lencanaStatus('Terbit', 'hijau') : lencanaStatus('Draf', 'kuning'),
        ),
        h(
          'div',
          { class: 'susun-aksi' },
          tombol('Naik', urutBab(i, -1), { mati: i === 0, nama: `Naikkan bab ${b.judul}` }),
          tombol('Turun', urutBab(i, 1), {
            mati: i === s.bab.length - 1,
            nama: `Turunkan bab ${b.judul}`,
          }),
          h(
            'a',
            { class: 'tombol tombol--kecil', href: `#/penyusun/${s.kursus.id}/bab/${b.id}` },
            'Ubah bab',
          ),
          tombol(b.is_published ? 'Jadikan draf' : 'Terbitkan', terbitBab(b), {
            nama: `${b.is_published ? 'Jadikan draf' : 'Terbitkan'} bab ${b.judul}`,
          }),
          tombol('Hapus', hapus(b.judul, `${A}/bab/${b.id}`, 'bab'), {
            kelas: 'tombol--bahaya',
            nama: `Hapus bab ${b.judul}`,
          }),
        ),
      ),
      b.modul_judul
        ? h(
            'p',
            { class: 'isian__bantu' },
            `Evaluasi bab: modul "${b.modul_judul}" (${b.modul_terbit ? 'terbit' : 'draf, bab tidak tampil ke peserta'}).`,
          )
        : null,
      b.pelajaran.length
        ? h(
            'ol',
            { class: 'susun-daftar' },
            b.pelajaran.map((p, j) => barisPelajaran(b, p, j)),
          )
        : h('p', { class: 'isian__bantu' }, 'Belum ada pelajaran di bab ini.'),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        JENIS_PELAJARAN.map((j) =>
          h(
            'a',
            {
              class: 'tombol tombol--kecil',
              href: `#/penyusun/${s.kursus.id}/pelajaran/baru?bab=${b.id}&jenis=${j}`,
            },
            `+ ${LABEL_JENIS_PELAJARAN[j]}`,
          ),
        ),
      ),
    );

  const tingkat = { masalah: 'merah', peringatan: 'kuning', info: 'biru' } as const;
  const labelTingkat = {
    masalah: 'Perlu diperbaiki',
    peringatan: 'Perhatian',
    info: 'Info',
  } as const;

  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/penyusun' }, 'Penyusun kursus'),
      ` / ${s.kursus.kode}`,
    ),
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, s.kursus.judul),
      h(
        'p',
        null,
        s.kursus.is_published
          ? lencanaStatus('Kursus tayang', 'hijau')
          : lencanaStatus('Kursus draf', 'kuning'),
        ' ',
        h('a', { href: '#/kursus' }, 'Pengaturan kursus dan modul'),
      ),
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-kesiapan' },
      h('h2', { id: 'j-kesiapan' }, 'Kesiapan terbit'),
      kesiapan.item.length === 0
        ? h(
            'p',
            { class: 'pesan pesan--berhasil' },
            'Tidak ada masalah. Struktur kursus siap diterbitkan.',
          )
        : [
            h(
              'p',
              { class: kesiapan.siap ? 'pesan' : 'pesan pesan--peringatan' },
              kesiapan.siap
                ? 'Tidak ada masalah yang menghalangi, ada catatan di bawah.'
                : 'Ada masalah yang sebaiknya diperbaiki sebelum terbit.',
            ),
            h(
              'ul',
              { class: 'kesiapan' },
              kesiapan.item.map((x) =>
                h(
                  'li',
                  null,
                  lencanaStatus(labelTingkat[x.tingkat], tingkat[x.tingkat]),
                  ' ',
                  x.pesan,
                ),
              ),
            ),
          ],
    ),
    s.bab.length
      ? s.bab.map(kartuBab)
      : h(
          'section',
          { class: 'panel' },
          h('p', null, 'Kursus ini belum punya bab. Tambahkan bab pertama.'),
        ),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h(
        'a',
        { class: 'tombol tombol--primer', href: `#/penyusun/${s.kursus.id}/bab/baru` },
        'Tambah bab',
      ),
    ),
    h(
      'section',
      { class: 'panel jarak-atas', 'aria-labelledby': 'j-riwayat' },
      h('h2', { id: 'j-riwayat' }, 'Riwayat perubahan'),
      riwayat.riwayat.length === 0
        ? h('p', { class: 'isian__bantu' }, 'Belum ada perubahan tercatat.')
        : tabel(
            [
              { judul: 'Waktu', isi: (x) => waktuWib(x.created_at) },
              { judul: 'Penyunting', isi: (x) => x.aktor },
              { judul: 'Aksi', isi: (x) => `${x.aksi} ${x.entitas.replace('_', ' ')}` },
            ],
            riwayat.riwayat,
            'Riwayat perubahan kursus',
          ),
    ),
  );
}

/* --------------------------------- Bab --------------------------------- */

async function layarBab(k: Konteks, kursusId: string, idArg: string): Promise<void> {
  const s = await get<Struktur>(`${A}/kursus/${encodeURIComponent(kursusId)}/struktur`);
  const baru = idArg === 'baru';
  const bab = baru ? null : (s.bab.find((b) => String(b.id) === idArg) ?? null);
  if (!baru && !bab) throw new ApiError(404, 'tidak_ditemukan', 'Bab tidak ditemukan.', {});
  const dipakai = new Set(s.bab.filter((b) => b.id !== bab?.id).map((b) => b.modul_id));
  const form = h(
    'form',
    { novalidate: true },
    h(
      'div',
      { class: 'grid-isian' },
      teks('judul', 'Judul bab', bab?.judul ?? '', { wajib: true, maks: 160 }),
      pilihan(
        'modul_id',
        'Evaluasi bab (pre-test dan post-test)',
        [
          ['', 'Tanpa evaluasi'],
          ...s.modul
            .filter((m) => !dipakai.has(m.id))
            .map((m): [string, string] => [
              String(m.id),
              `Modul ${m.nomor}. ${m.judul}${m.is_published ? '' : ' (draf)'}`,
            ]),
        ],
        bab?.modul_id === null || bab === null ? '' : String(bab.modul_id),
        { bantu: 'Satu modul hanya dapat ditautkan ke satu bab. Bab tampil bila modulnya terbit.' },
      ),
    ),
    centang('is_published', 'Terbitkan bab ini', bab?.is_published ?? false),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h(
        'button',
        { class: 'tombol tombol--primer', type: 'submit' },
        baru ? 'Tambah bab' : 'Simpan bab',
      ),
      h('a', { class: 'tombol', href: `#/penyusun/${kursusId}` }, 'Batal'),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = bacaForm(form);
    const modul = String(v.modul_id ?? '');
    const body = {
      judul: v.judul,
      modul_id: modul === '' ? null : Number(modul),
      is_published: v.is_published,
      ...(bab ? { version: bab.version } : {}),
    };
    void sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        if (bab) await kirim('PUT', `${A}/bab/${bab.id}`, body);
        else await kirim('POST', `${A}/kursus/${kursusId}/bab`, body);
        toast('Bab tersimpan.', 'berhasil');
        location.hash = `#/penyusun/${kursusId}`;
      } catch (err) {
        tampilkanGalatForm(form, err);
      }
    });
  });
  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/penyusun' }, 'Penyusun kursus'),
      ' / ',
      h('a', { href: `#/penyusun/${kursusId}` }, s.kursus.kode),
      baru ? ' / Bab baru' : ` / Bab ${bab!.urutan}`,
    ),
    h('h1', null, baru ? 'Bab baru' : 'Ubah bab'),
    h('section', { class: 'panel susun-sempit' }, form),
  );
}

/* ------------------------------ Pelajaran ------------------------------ */

async function layarPelajaran(k: Konteks, kursusId: string, idArg: string): Promise<void> {
  const s = await get<Struktur>(`${A}/kursus/${encodeURIComponent(kursusId)}/struktur`);
  const baru = idArg === 'baru';
  const q = paramHash();
  let pel: PelajaranAdmin | null = null;
  let bab: BabAdmin | undefined;
  if (!baru) {
    for (const b of s.bab) {
      const p = b.pelajaran.find((x) => String(x.id) === idArg);
      if (p) {
        pel = p;
        bab = b;
      }
    }
    if (!pel) throw new ApiError(404, 'tidak_ditemukan', 'Pelajaran tidak ditemukan.', {});
  } else {
    bab = s.bab.find((b) => String(b.id) === q.get('bab'));
    if (!bab) throw new ApiError(404, 'tidak_ditemukan', 'Bab tujuan tidak ditemukan.', {});
  }
  const jenisQuery = q.get('jenis') as JenisPelajaran | null;
  const jenis: JenisPelajaran =
    pel?.jenis ?? (jenisQuery && JENIS_PELAJARAN.includes(jenisQuery) ? jenisQuery : 'video');
  const isiLama = pel?.isi ?? {};
  const str = (kunci: string): string =>
    isiLama[kunci] === undefined || isiLama[kunci] === null ? '' : String(isiLama[kunci]);

  const bagianIsi: HTMLElement[] = [];
  let ambilIsi: (v: Record<string, unknown>) => Record<string, unknown> = () => ({});
  if (jenis === 'video') {
    const url = teks('isi_url', 'Tautan video YouTube', str('url'), {
      wajib: true,
      maks: 500,
      bantu:
        'Tempel tautan YouTube biasa (watch, youtu.be, shorts); disimpan sebagai tautan youtube-nocookie.',
    });
    const status = h('p', { class: 'isian__bantu', 'aria-live': 'polite' });
    const input = url.querySelector('input')!;
    const periksa = (): void => {
      const id = idVideoYoutube(input.value.trim());
      status.textContent =
        input.value.trim() === ''
          ? ''
          : id
            ? `Tautan dikenali (ID ${id}).`
            : 'Tautan YouTube belum dikenali.';
    };
    input.addEventListener('input', periksa);
    input.addEventListener('blur', () => {
      const id = idVideoYoutube(input.value.trim());
      if (id) input.value = urlEmbedYoutube(id);
      periksa();
    });
    periksa();
    bagianIsi.push(
      url,
      status,
      teks('isi_durasi', 'Durasi video (opsional, mm:ss)', str('durasi'), { maks: 10 }),
    );
    ambilIsi = (v) => ({ url: v.isi_url, durasi: String(v.isi_durasi ?? '').trim() || null });
  } else if (jenis === 'bacaan') {
    const md = area('isi_markdown', 'Isi bacaan (Markdown)', str('markdown'), {
      maks: 30000,
      bantu:
        'Mendukung judul (#), daftar, kutipan (>), kode, **tebal**, *miring*, dan tautan https.',
    });
    const pratinjau = h('div', { class: 'susun-pratinjau', 'aria-live': 'polite' });
    const ta = md.querySelector('textarea')!;
    const gambar = (): void => isi(pratinjau, markdown(ta.value));
    ta.addEventListener('input', gambar);
    gambar();
    bagianIsi.push(
      h(
        'div',
        { class: 'susun-dua' },
        md,
        h('div', null, h('p', { class: 'isian__bantu' }, 'Pratinjau'), pratinjau),
      ),
    );
    ambilIsi = (v) => ({ markdown: v.isi_markdown });
  } else if (jenis === 'pdf') {
    bagianIsi.push(
      teks('isi_url', 'Tautan dokumen (https)', str('url'), {
        wajib: true,
        maks: 500,
        bantu: 'Dokumen dibuka peserta di tab baru. Unggah berkas belum tersedia.',
      }),
      teks('isi_penerbit', 'Penerbit (opsional)', str('penerbit'), { maks: 120 }),
      angka('isi_halaman', 'Jumlah halaman (opsional)', isiLama.halaman as number | undefined, {
        min: 1,
        max: 5000,
      }),
    );
    ambilIsi = (v) => ({
      url: v.isi_url,
      penerbit: String(v.isi_penerbit ?? '').trim() || null,
      halaman: v.isi_halaman ?? null,
    });
  } else {
    bagianIsi.push(
      area('isi_petunjuk', 'Petunjuk latihan (opsional)', str('petunjuk'), { maks: 1000 }),
      angka(
        'isi_nilai_lulus',
        'Nilai minimal lulus latihan',
        (isiLama.nilai_lulus as number | undefined) ?? 60,
        { min: 0, max: 100 },
      ),
    );
    ambilIsi = (v) => ({
      petunjuk: String(v.isi_petunjuk ?? '').trim() || null,
      nilai_lulus: v.isi_nilai_lulus ?? 60,
    });
  }

  const galatIsi = h('p', { class: 'pesan pesan--galat', role: 'alert', hidden: true });
  const form = h(
    'form',
    { novalidate: true },
    h(
      'div',
      { class: 'grid-isian' },
      teks('judul', 'Judul pelajaran', pel?.judul ?? '', { wajib: true, maks: 160 }),
      angka('durasi_menit', 'Perkiraan durasi (menit)', pel?.durasi_menit ?? 0, {
        min: 0,
        max: 600,
      }),
    ),
    bagianIsi,
    galatIsi,
    centang('wajib', 'Wajib diselesaikan untuk membuka ujian akhir', pel?.wajib ?? true),
    centang('is_published', 'Terbitkan pelajaran ini', pel?.is_published ?? false),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h(
        'button',
        { class: 'tombol tombol--primer', type: 'submit' },
        baru ? 'Tambah pelajaran' : 'Simpan pelajaran',
      ),
      pel
        ? h('a', { class: 'tombol', href: `#/pratinjau/${pel.id}` }, 'Pratinjau sebagai peserta')
        : null,
      h('a', { class: 'tombol', href: `#/penyusun/${kursusId}` }, 'Kembali'),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = bacaForm(form);
    const body = {
      judul: v.judul,
      jenis,
      isi: ambilIsi(v),
      durasi_menit: v.durasi_menit ?? 0,
      wajib: v.wajib,
      is_published: v.is_published,
      ...(pel ? { version: pel.version } : {}),
    };
    galatIsi.hidden = true;
    void sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        if (pel) {
          await kirim('PUT', `${A}/pelajaran/${pel.id}`, body);
          toast('Pelajaran tersimpan.', 'berhasil');
          void layarPenyusun(k);
        } else {
          const r = await kirim<{ id: number }>('POST', `${A}/bab/${bab!.id}/pelajaran`, body);
          toast('Pelajaran ditambahkan.', 'berhasil');
          // Latihan perlu soal: lanjutkan ke penyunting yang memuat pengelola soal.
          location.hash =
            jenis === 'latihan'
              ? `#/penyusun/${kursusId}/pelajaran/${r.id}`
              : `#/penyusun/${kursusId}`;
        }
      } catch (err) {
        galatIsi.textContent = pesanGalat(err);
        galatIsi.hidden = !(err instanceof ApiError && err.rincian.isi);
        tampilkanGalatForm(form, err);
      }
    });
  });

  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/penyusun' }, 'Penyusun kursus'),
      ' / ',
      h('a', { href: `#/penyusun/${kursusId}` }, s.kursus.kode),
      ` / ${bab!.judul}`,
    ),
    h(
      'h1',
      null,
      baru
        ? `Pelajaran baru: ${LABEL_JENIS_PELAJARAN[jenis]}`
        : `Ubah pelajaran: ${LABEL_JENIS_PELAJARAN[jenis]}`,
    ),
    h('section', { class: 'panel' }, form),
    pel && jenis === 'latihan' ? await panelSoal(pel) : null,
  );
}

/* ----------------------------- Soal latihan ----------------------------- */

async function panelSoal(pel: PelajaranAdmin): Promise<HTMLElement> {
  const wadah = h('section', { class: 'panel jarak-atas', 'aria-labelledby': 'j-soal-latihan' });
  const gambar = async (ubah: SoalAdmin | null = null): Promise<void> => {
    const { soal } = await get<{ soal: SoalAdmin[] }>(`${A}/pelajaran/${pel.id}/soal`);
    const form = h(
      'form',
      { novalidate: true, class: 'susun-soal-form' },
      h('h3', null, ubah ? `Ubah soal ${ubah.id}` : 'Tambah soal'),
      area('pertanyaan', 'Pertanyaan', ubah?.pertanyaan ?? '', { wajib: true, maks: 2000 }),
      h(
        'div',
        { class: 'grid-isian' },
        HURUF.map((hh) =>
          teks(
            `opsi_${hh}`,
            `Opsi ${hh}${hh === 'A' || hh === 'B' ? '' : ' (opsional)'}`,
            ubah?.opsi.find((o) => o.id === hh)?.text ?? '',
            {
              wajib: hh === 'A' || hh === 'B',
              maks: 500,
            },
          ),
        ),
      ),
      pilihan('kunci', 'Kunci jawaban', HURUF, ubah?.kunci ?? 'A'),
      area(
        'pembahasan',
        'Pembahasan (tampil setelah peserta memeriksa jawaban)',
        ubah?.pembahasan ?? '',
        { maks: 3000 },
      ),
      centang('is_active', 'Soal aktif', ubah?.is_active ?? true),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h(
          'button',
          { class: 'tombol tombol--primer', type: 'submit' },
          ubah ? 'Simpan soal' : 'Tambah soal',
        ),
        ubah
          ? h(
              'button',
              { class: 'tombol', type: 'button', onclick: () => void gambar(null) },
              'Batal ubah',
            )
          : null,
      ),
    ) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = bacaForm(form);
      const opsi = HURUF.map((hh) => ({
        id: hh,
        text: String(v[`opsi_${hh}`] ?? '').trim(),
      })).filter((o) => o.text !== '');
      const body = {
        pertanyaan: v.pertanyaan,
        opsi,
        kunci: v.kunci,
        pembahasan: String(v.pembahasan ?? '').trim() || null,
        is_active: v.is_active,
      };
      void sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
        try {
          if (ubah) await kirim('PUT', `${A}/soal-latihan/${ubah.id}`, body);
          else await kirim('POST', `${A}/pelajaran/${pel.id}/soal`, body);
          toast('Soal tersimpan.', 'berhasil');
          await gambar(null);
        } catch (err) {
          tampilkanGalatForm(form, err);
        }
      });
    });
    isi(
      wadah,
      h('h2', { id: 'j-soal-latihan' }, `Soal latihan (${soal.length})`),
      soal.length
        ? h(
            'ol',
            { class: 'susun-soal' },
            soal.map((x) =>
              h(
                'li',
                { 'data-soal': x.id },
                h(
                  'div',
                  null,
                  h('strong', null, x.pertanyaan),
                  h(
                    'p',
                    { class: 'isian__bantu' },
                    `Kunci ${x.kunci}, ${x.opsi.length} opsi${x.is_active ? '' : ', nonaktif'}`,
                  ),
                ),
                h(
                  'div',
                  { class: 'susun-aksi' },
                  h(
                    'button',
                    {
                      class: 'tombol tombol--kecil',
                      type: 'button',
                      onclick: () => void gambar(x),
                    },
                    'Ubah',
                  ),
                  h(
                    'button',
                    {
                      class: 'tombol tombol--kecil tombol--bahaya',
                      type: 'button',
                      onclick: () =>
                        void konfirmasi(
                          'Hapus soal?',
                          'Soal latihan ini dihapus permanen.',
                          'Hapus',
                        ).then(async (ya) => {
                          if (!ya) return;
                          try {
                            await kirim('DELETE', `${A}/soal-latihan/${x.id}`);
                            toast('Soal dihapus.', 'berhasil');
                            await gambar(null);
                          } catch (err) {
                            toast(pesanGalat(err), 'galat');
                          }
                        }),
                    },
                    'Hapus',
                  ),
                ),
              ),
            ),
          )
        : h(
            'p',
            { class: 'isian__bantu' },
            'Belum ada soal. Latihan tanpa soal tidak dapat dikerjakan peserta.',
          ),
      form,
    );
  };
  await gambar();
  return wadah;
}
