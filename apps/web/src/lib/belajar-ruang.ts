/**
 * Halaman Ruang Belajar bentuk kursus berbab (ADR-0007): katalog bersaringan, silabus, pemutar pelajaran,
 * dan "Kursus saya". Dipanggil dari pages/belajar.ts, yang tetap memegang router, ujian, dan sertifikat.
 *
 * Isi pelajaran hanya dibaca dari endpoint peserta terdaftar; latihan dinilai di server.
 */
import {
  formatDurasiMenit,
  idVideoYoutube,
  LABEL_JENIS_PELAJARAN,
  LABEL_KATEGORI_PESERTA,
  LABEL_LEVEL_KURSUS,
  urlEmbedYoutube,
  type JenisPelajaran,
  type KategoriPeserta,
  type LevelKursus,
} from '@sikop/shared';
import type { Saya } from './akun.ts';
import { ApiError, get, kirim, qs } from './api.ts';
import { h, ikon, IKON, isi } from './dom.ts';
import { markdown } from './markdown.ts';
import { kerangka, kosong, sibuk, toast } from './ui.ts';

/* ------------------------------- Tipe ------------------------------- */

export interface Kursus {
  id: string;
  kode: string;
  judul: string;
  subjudul: string;
  deskripsi: string;
  kategori: string;
  estimasi: string;
  nilai_lulus_akhir: number;
  durasi_akhir_menit: number;
  jumlah_soal_akhir: number;
  jumlah_modul?: number;
  level?: LevelKursus;
  sasaran?: KategoriPeserta[];
  hasil_belajar?: string[];
  durasi_menit?: number;
  gambar_url?: string | null;
  jumlah_pelajaran?: number;
  jumlah_pelajaran_wajib?: number;
  bersertifikat?: boolean;
}
export interface PelajaranRingkas {
  id: number;
  urutan: number;
  judul: string;
  jenis: JenisPelajaran;
  durasi_menit: number;
  wajib: boolean;
}
export interface BabRingkas {
  id: number;
  modul_id: number | null;
  urutan: number;
  judul: string;
  pelajaran: PelajaranRingkas[];
}
export interface RingkasProgres {
  selesai: number[];
  total: number;
  wajib_total: number;
  wajib_selesai: number;
  persen: number;
  lanjut: number | null;
}
export interface Progres {
  modul: {
    id: number;
    nomor: number;
    judul: string;
    nilai_lulus: number;
    pre: { id: string; nilai: number } | null;
    post_terbaik: number | null;
    post_percobaan: number;
    post_lulus_id: string | null;
    lulus: boolean;
  }[];
  akhir: {
    boleh_mulai: boolean;
    pelajaran_wajib_belum?: number;
    percobaan: { id: string; nilai: number; lulus: boolean; selesai_at: string }[];
    percobaan_24_jam: number;
    lulus: boolean;
  };
  pelajaran?: RingkasProgres;
  sertifikat: { nomor: string; kode_verifikasi: string; terbit_at: string; status: string } | null;
}
export interface DataKursus {
  kursus: Kursus;
  modul: { id: number; nomor: number; judul: string; nilai_lulus: number }[];
  bab: BabRingkas[];
  jumlah_soal_akhir_tersedia: number;
}

/** Ketergantungan dari router halaman agar modul ini tidak saling mengimpor. */
export interface Konteks {
  app: HTMLElement;
  judul: (t: string) => void;
  statusPeserta: (s: Saya) => HTMLElement | null;
  bagianAkhir: (k: Kursus, p: Progres | null, s: Saya, semuaLulus: boolean) => HTMLElement;
}

const IKON_JENIS: Record<JenisPelajaran, string> = {
  video: IKON.video,
  bacaan: IKON.bacaan,
  pdf: IKON.dokumen,
  latihan: IKON.latihan,
};
const ikonJenis = (j: JenisPelajaran): SVGSVGElement => ikon(IKON_JENIS[j]);

const menit = (n: number): string => (n > 0 ? formatDurasiMenit(n) : '');
const ke = (kursus: string, pelajaran: number): string => `#/belajar/${kursus}/${pelajaran}`;
const semuaPelajaran = (bab: BabRingkas[]): PelajaranRingkas[] => bab.flatMap((b) => b.pelajaran);

function bilahProgres(persen: number, label: string): HTMLElement {
  return h(
    'div',
    { class: 'progres' },
    h('progress', { max: 100, value: persen, 'aria-label': label }),
    h('span', null, `${persen}%`),
  );
}

/* ------------------------------ Katalog ------------------------------ */

interface Saringan {
  sasaran: string;
  level: string;
  tema: string;
  q: string;
}
const bacaSaringan = (): Saringan => {
  const p = new URLSearchParams(location.hash.split('?')[1] ?? '');
  return {
    sasaran: p.get('sasaran') ?? '',
    level: p.get('level') ?? '',
    tema: p.get('tema') ?? '',
    q: p.get('q') ?? '',
  };
};
const simpanSaringan = (f: Saringan): void => {
  // replaceState tidak memicu hashchange, jadi daftar diperbarui tanpa memuat ulang halaman.
  history.replaceState(null, '', `#/${qs({ ...f })}`);
};

export const cocokSaringan = (k: Kursus, f: Saringan): boolean =>
  (!f.sasaran || !k.sasaran?.length || k.sasaran.includes(f.sasaran as KategoriPeserta)) &&
  (!f.level || k.level === f.level) &&
  (!f.tema || k.kategori === f.tema) &&
  (!f.q.trim() || k.judul.toLowerCase().includes(f.q.trim().toLowerCase()));

function kartuKursus(k: Kursus, sesuai = false): HTMLElement {
  const href = `#/kursus/${k.id}`;
  return h(
    'article',
    { class: 'kartu-kursus' },
    h(
      'a',
      { class: 'kartu-kursus__gambar', href, tabindex: -1, 'aria-hidden': 'true' },
      k.gambar_url
        ? h('img', { src: k.gambar_url, alt: '', loading: 'lazy', width: 640, height: 360 })
        : ikon(IKON.belajar),
    ),
    h(
      'div',
      { class: 'kartu-kursus__isi' },
      h(
        'div',
        { class: 'baris-lencana' },
        k.level ? h('span', { class: 'lencana lencana--biru' }, LABEL_LEVEL_KURSUS[k.level]) : null,
        k.bersertifikat ? h('span', { class: 'lencana lencana--hijau' }, 'Bersertifikat') : null,
        sesuai ? h('span', { class: 'lencana lencana--kuning' }, 'Sesuai untuk Anda') : null,
      ),
      h('h3', null, h('a', { href }, k.judul)),
      h('p', { class: 'kartu-kursus__deskripsi' }, k.subjudul || k.deskripsi),
      h(
        'ul',
        { class: 'meta' },
        k.jumlah_pelajaran ? h('li', null, `${k.jumlah_pelajaran} pelajaran`) : null,
        k.durasi_menit ? h('li', null, menit(k.durasi_menit)) : null,
        h(
          'li',
          null,
          k.sasaran?.length
            ? `Untuk ${k.sasaran.map((x) => LABEL_KATEGORI_PESERTA[x]).join(', ')}`
            : 'Untuk semua peserta',
        ),
      ),
      h('a', { class: 'tombol tombol--primer tombol--kecil', href }, 'Lihat kursus'),
    ),
  );
}

/** Kursus yang menyasar kategori peserta ini secara khusus (bukan kursus untuk semua peserta). */
export const sesuaiKategori = (k: Kursus, kategori: KategoriPeserta | undefined): boolean =>
  Boolean(kategori && k.sasaran?.length && k.sasaran.includes(kategori));

/** Kursus yang sesuai kategori peserta ditaruh di depan; urutan lain dipertahankan. */
export const urutkanUntukPeserta = (
  daftar: Kursus[],
  kategori: KategoriPeserta | undefined,
): Kursus[] =>
  daftar
    .map((k, i) => ({ k, i, s: sesuaiKategori(k, kategori) ? 0 : 1 }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.k);

/** Tiga langkah singkat agar pengunjung baru langsung paham cara belajar di SIKOP. */
function langkahBelajar(s: Saya): HTMLElement {
  const langkah: [string, string, string][] = [
    [
      IKON.cari,
      'Pilih kursus',
      'Lihat silabus tanpa masuk. Saringan membantu menemukan kursus sesuai kebutuhan Anda.',
    ],
    [
      IKON.belajar,
      'Belajar dengan santai',
      'Tonton video, baca materi, dan kerjakan latihan. Kemajuan Anda tersimpan otomatis.',
    ],
    [
      IKON.latihan,
      'Uji dan dapatkan sertifikat',
      'Kerjakan evaluasi bab dan ujian akhir. Sertifikat dapat diverifikasi secara daring.',
    ],
  ];
  const aksi = !s.akun
    ? h('a', { class: 'tombol tombol--primer', href: '#/masuk' }, 'Masuk untuk mulai')
    : !s.peserta
      ? h('a', { class: 'tombol tombol--primer', href: '#/akun' }, 'Lengkapi profil peserta')
      : null;
  return h(
    'section',
    { class: 'langkah-belajar', 'aria-labelledby': 'j-langkah' },
    h('h2', { id: 'j-langkah', class: 'langkah-belajar__judul' }, 'Cara belajar di sini'),
    h(
      'ol',
      { class: 'langkah-belajar__daftar' },
      langkah.map(([ik, judul, teks], i) =>
        h(
          'li',
          null,
          h('span', { class: 'langkah-belajar__nomor', 'aria-hidden': 'true' }, String(i + 1)),
          ikon(ik),
          h('strong', null, judul),
          h('span', { class: 'isian__bantu' }, teks),
        ),
      ),
    ),
    aksi ? h('div', { class: 'baris-tombol' }, aksi) : null,
  );
}

export async function halamanKatalog(ctx: Konteks, s: Saya): Promise<void> {
  ctx.judul('Ruang Belajar');
  isi(ctx.app, kerangka(6));
  const [{ kursus }, saya] = await Promise.all([
    get<{ kursus: Kursus[] }>('/lms/kursus'),
    s.peserta
      ? get<{ kursus: KursusSaya[] }>('/lms/saya/kursus').catch(() => ({ kursus: [] }))
      : Promise.resolve({ kursus: [] as KursusSaya[] }),
  ]);
  const f = bacaSaringan();
  const tema = [...new Set(kursus.map((k) => k.kategori).filter(Boolean))].sort();
  const daftar = h('div', { class: 'grid-kursus', 'aria-live': 'polite' });
  const jumlah = h('p', { class: 'isian__bantu' });

  const kategori = s.peserta?.kategori;
  const gambar = (): void => {
    const hasil = urutkanUntukPeserta(
      kursus.filter((k) => cocokSaringan(k, f)),
      kategori,
    );
    jumlah.textContent = `${hasil.length} dari ${kursus.length} kursus`;
    isi(
      daftar,
      hasil.length
        ? hasil.map((k) => kartuKursus(k, sesuaiKategori(k, kategori)))
        : kursus.length === 0
          ? kosong(
              'Sedang dalam tahap pengembangan',
              'Kursus akan diterbitkan bertahap setelah materi, latihan, dan ujiannya selesai diuji. Silakan kembali lagi nanti.',
            )
          : kosong(
              'Tidak ada kursus yang cocok',
              'Ubah atau kosongkan saringan untuk melihat semua kursus.',
            ),
    );
  };
  const pilih = (
    id: string,
    label: string,
    nilai: [string, string][],
    kunci: keyof Saringan,
  ): HTMLElement => {
    const el = h(
      'select',
      { id, name: kunci },
      h('option', { value: '' }, 'Semua'),
      nilai.map(([v, t]) => h('option', { value: v, selected: f[kunci] === v }, t)),
    ) as HTMLSelectElement;
    el.addEventListener('change', () => {
      f[kunci] = el.value;
      simpanSaringan(f);
      gambar();
    });
    return h('div', { class: 'isian' }, h('label', { for: id }, label), el);
  };
  const cari = h('input', {
    id: 'f-cari',
    name: 'q',
    type: 'search',
    value: f.q,
    placeholder: 'Cari judul kursus',
    autocomplete: 'off',
  }) as HTMLInputElement;
  cari.addEventListener('input', () => {
    f.q = cari.value;
    simpanSaringan(f);
    gambar();
  });

  const lanjut = [...saya.kursus]
    .filter((k) => k.status === 'berjalan' && k.lanjut_pelajaran_id !== null)
    .sort((a, b) => (b.terakhir_belajar ?? '').localeCompare(a.terakhir_belajar ?? ''))[0];

  isi(
    ctx.app,
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, 'Ruang Belajar'),
      h(
        'p',
        null,
        'Pembinaan statistik sektoral untuk walidata, produsen data, pelajar, dan masyarakat umum.',
      ),
    ),
    h(
      'div',
      { class: 'pesan pesan--tahap', role: 'note' },
      h('p', null, h('span', { class: 'label-tahap' }, 'Tahap pengembangan')),
      h(
        'p',
        null,
        'Ruang Belajar sedang dikembangkan. Katalog, materi, dan sertifikat dapat berubah sebelum peluncuran resmi.',
      ),
    ),
    s.akun
      ? null
      : h(
          'p',
          { class: 'pesan' },
          'Katalog dan silabus dapat dilihat tanpa masuk. Untuk belajar, mengerjakan latihan dan ujian, serta memperoleh sertifikat, ',
          h('a', { href: '#/masuk' }, 'masuk dengan akun Google'),
          '.',
        ),
    lanjut
      ? h(
          'section',
          { class: 'panel panel--lanjut', 'aria-labelledby': 'j-lanjut' },
          h(
            'div',
            null,
            h('h2', { id: 'j-lanjut' }, 'Lanjutkan belajar'),
            h('p', null, lanjut.judul),
            bilahProgres(lanjut.persen, `Kemajuan ${lanjut.judul}`),
          ),
          h(
            'div',
            { class: 'baris-tombol' },
            h(
              'a',
              { class: 'tombol tombol--primer', href: ke(lanjut.id, lanjut.lanjut_pelajaran_id!) },
              'Lanjutkan',
            ),
            h('a', { class: 'tombol', href: '#/saya' }, 'Kursus saya'),
          ),
        )
      : s.peserta
        ? h('p', null, h('a', { href: '#/saya' }, 'Lihat kursus saya'))
        : null,
    lanjut ? null : langkahBelajar(s),
    kursus.length === 0
      ? null
      : h(
          'form',
          {
            class: 'saringan',
            role: 'search',
            'aria-label': 'Saring kursus',
            onsubmit: (e: Event) => e.preventDefault(),
          },
          h('div', { class: 'isian' }, h('label', { for: 'f-cari' }, 'Cari judul'), cari),
          pilih('f-sasaran', 'Sasaran peserta', Object.entries(LABEL_KATEGORI_PESERTA), 'sasaran'),
          pilih('f-level', 'Level', Object.entries(LABEL_LEVEL_KURSUS), 'level'),
          pilih(
            'f-tema',
            'Tema',
            tema.map((t) => [t, t]),
            'tema',
          ),
        ),
    kursus.length === 0 ? null : jumlah,
    daftar,
  );
  gambar();
}

/* ------------------------------ Kursus ------------------------------ */

const nilaiPenyelesaian = (bab: BabRingkas, selesai: Set<number>): [number, number] => [
  bab.pelajaran.filter((p) => selesai.has(p.id)).length,
  bab.pelajaran.length,
];

function silabus(
  kursusId: string,
  bab: BabRingkas[],
  selesai: Set<number>,
  aktif?: number,
  opsi: { tautan?: (id: number) => string; evaluasi?: boolean } = {},
): HTMLElement {
  const tautan = opsi.tautan ?? ((id: number): string => ke(kursusId, id));
  return h(
    'div',
    { class: 'silabus' },
    bab.map((b, i) => {
      const [a, n] = nilaiPenyelesaian(b, selesai);
      const total = b.pelajaran.reduce((x, p) => x + p.durasi_menit, 0);
      return h(
        'details',
        { class: 'silabus__bab', open: aktif ? b.pelajaran.some((p) => p.id === aktif) : i === 0 },
        h(
          'summary',
          null,
          ikon(IKON.bawah),
          h(
            'span',
            { class: 'silabus__judul' },
            h('strong', null, `Bab ${b.urutan}. ${b.judul}`),
            h(
              'span',
              { class: 'isian__bantu' },
              `${n} pelajaran${total ? `, ${menit(total)}` : ''}${selesai.size || aktif ? `, ${a} selesai` : ''}`,
            ),
          ),
        ),
        h(
          'ol',
          null,
          b.pelajaran.map((p) => {
            const sudah = selesai.has(p.id);
            const isiBaris = [
              h(
                'span',
                { class: `silabus__tanda${sudah ? ' silabus__tanda--selesai' : ''}` },
                sudah ? ikon(IKON.centang, 'Selesai') : ikonJenis(p.jenis),
              ),
              h(
                'span',
                { class: 'silabus__nama' },
                p.judul,
                h(
                  'span',
                  { class: 'isian__bantu' },
                  `${LABEL_JENIS_PELAJARAN[p.jenis]}${p.durasi_menit ? `, ${menit(p.durasi_menit)}` : ''}${p.wajib ? '' : ', opsional'}`,
                ),
              ),
            ];
            return h(
              'li',
              { class: p.id === aktif ? 'aktif' : null },
              h(
                'a',
                { href: tautan(p.id), 'aria-current': p.id === aktif ? 'page' : null },
                isiBaris,
              ),
            );
          }),
          b.modul_id && opsi.evaluasi !== false
            ? h(
                'li',
                { class: 'silabus__evaluasi' },
                h(
                  'a',
                  { href: `#/modul/${b.modul_id}` },
                  ikon(IKON.latihan),
                  h('span', { class: 'silabus__nama' }, 'Evaluasi bab: pre-test dan post-test'),
                ),
              )
            : null,
        ),
      );
    }),
  );
}

export function tampilKursus(ctx: Konteks, s: Saya, d: DataKursus, progres: Progres | null): void {
  const { kursus: k, bab } = d;
  ctx.judul(k.judul);
  const semua = semuaPelajaran(bab);
  const selesai = new Set(progres?.pelajaran?.selesai ?? []);
  const lanjutId = progres?.pelajaran?.lanjut ?? null;
  const semuaLulus = Boolean(progres?.modul.length) && progres!.modul.every((m) => m.lulus);
  const pertama = semua[0]?.id;

  let mulai: HTMLElement;
  const kembali = encodeURIComponent(`#/kursus/${k.id}`);
  if (!s.akun)
    mulai = h(
      'a',
      { class: 'tombol tombol--primer', href: `#/masuk?lanjut=${kembali}` },
      'Masuk untuk mulai belajar',
    );
  else if (!s.peserta)
    mulai = h(
      'a',
      { class: 'tombol tombol--primer', href: `#/akun?lanjut=${kembali}` },
      'Daftar peserta untuk mulai belajar',
    );
  else if (pertama === undefined)
    mulai = h('span', { class: 'isian__bantu' }, 'Pelajaran sedang disiapkan.');
  else if (selesai.size === 0)
    mulai = h('a', { class: 'tombol tombol--primer', href: ke(k.id, pertama) }, 'Mulai belajar');
  else if (lanjutId !== null)
    mulai = h(
      'a',
      { class: 'tombol tombol--primer', href: ke(k.id, lanjutId) },
      'Lanjutkan belajar',
    );
  else mulai = h('a', { class: 'tombol', href: ke(k.id, pertama) }, 'Tinjau materi');

  const wajib = k.jumlah_pelajaran_wajib ?? semua.filter((p) => p.wajib).length;
  const syarat: string[] = [];
  if (wajib)
    syarat.push(
      `Selesaikan ${wajib} pelajaran wajib. Latihan dinyatakan selesai setelah mencapai nilai minimalnya.`,
    );
  if (d.modul.length) syarat.push(`Lulus post-test pada ${d.modul.length} evaluasi bab.`);
  syarat.push(
    `Lulus ujian akhir dengan nilai minimal ${k.nilai_lulus_akhir} (${k.jumlah_soal_akhir} soal, ${k.durasi_akhir_menit} menit, maksimal 3 percobaan dalam 24 jam).`,
  );

  isi(
    ctx.app,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/' }, 'Ruang Belajar'),
      ` / ${k.kode}`,
    ),
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, k.judul),
      h('p', null, k.subjudul || k.deskripsi),
      h(
        'ul',
        { class: 'meta' },
        k.level ? h('li', null, `Level ${LABEL_LEVEL_KURSUS[k.level].toLowerCase()}`) : null,
        k.jumlah_pelajaran ? h('li', null, `${k.jumlah_pelajaran} pelajaran`) : null,
        k.durasi_menit ? h('li', null, menit(k.durasi_menit)) : null,
        h(
          'li',
          null,
          k.sasaran?.length
            ? `Untuk ${k.sasaran.map((x) => LABEL_KATEGORI_PESERTA[x]).join(', ')}`
            : 'Untuk semua peserta',
        ),
      ),
    ),
    ctx.statusPeserta(s),
    h(
      'div',
      { class: 'dua-kolom' },
      h(
        'div',
        null,
        k.deskripsi && k.subjudul
          ? h(
              'section',
              { class: 'panel' },
              h('h2', null, 'Tentang kursus'),
              h('p', null, k.deskripsi),
            )
          : null,
        k.hasil_belajar?.length
          ? h(
              'section',
              { class: 'panel', 'aria-labelledby': 'j-hasil' },
              h('h2', { id: 'j-hasil' }, 'Yang akan Anda pelajari'),
              h(
                'ul',
                { class: 'daftar-centang' },
                k.hasil_belajar.map((x) => h('li', null, ikon(IKON.centang), h('span', null, x))),
              ),
            )
          : null,
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-silabus' },
          h('div', { class: 'panel__kepala' }, h('h2', { id: 'j-silabus' }, 'Silabus')),
          bab.length
            ? silabus(k.id, bab, selesai)
            : kosong('Silabus belum tersedia', 'Pelajaran untuk kursus ini sedang disiapkan.'),
        ),
      ),
      h(
        'aside',
        null,
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-aksi' },
          h('h2', { id: 'j-aksi' }, progres?.pelajaran ? 'Kemajuan Anda' : 'Mulai belajar'),
          progres?.pelajaran
            ? [
                bilahProgres(progres.pelajaran.persen, 'Kemajuan pelajaran'),
                h(
                  'p',
                  { class: 'isian__bantu' },
                  `${progres.pelajaran.selesai.length} dari ${progres.pelajaran.total} pelajaran selesai.`,
                ),
              ]
            : null,
          mulai,
        ),
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-syarat' },
          h('h2', { id: 'j-syarat' }, 'Syarat kelulusan dan sertifikat'),
          h(
            'ol',
            { class: 'daftar-syarat' },
            syarat.map((x) => h('li', null, x)),
          ),
          d.jumlah_soal_akhir_tersedia > 0
            ? ctx.bagianAkhir(k, progres, s, semuaLulus)
            : h('p', { class: 'isian__bantu' }, 'Kursus ini tidak menerbitkan sertifikat.'),
        ),
      ),
    ),
  );
}

/* ------------------------------ Pemutar ------------------------------ */

interface SoalLatihan {
  id: number;
  pertanyaan: string;
  opsi: { id: string; text: string }[];
}
interface HasilLatihan {
  nilai: number;
  benar: number;
  total: number;
  ambang: number;
  lulus: boolean;
  hasil: { id: number; benar: boolean; pembahasan: string | null }[];
}
interface DataPelajaran {
  pelajaran: {
    id: number;
    kursus_id: string;
    bab_judul: string;
    modul_id: number | null;
    judul: string;
    jenis: JenisPelajaran;
    durasi_menit: number;
    wajib: boolean;
    isi: Record<string, unknown>;
    selesai: boolean;
    soal?: SoalLatihan[];
  };
  sebelumnya: number | null;
  berikutnya: number | null;
  progres: RingkasProgres;
}

export async function halamanPemutar(
  ctx: Konteks,
  kursusId: string,
  pelajaranId: number,
): Promise<void> {
  isi(ctx.app, kerangka(8));
  let data: DataPelajaran;
  let kur: DataKursus;
  try {
    [data, kur] = await Promise.all([
      get<DataPelajaran>(`/lms/pelajaran/${pelajaranId}`),
      get<DataKursus>(`/lms/kursus/${encodeURIComponent(kursusId)}`),
    ]);
  } catch (e) {
    // Pelajaran hanya untuk peserta terdaftar: arahkan ke pendaftaran lalu kembali ke sini.
    if (e instanceof ApiError && (e.kode === 'profil' || e.status === 403))
      return void (location.hash = `#/akun?lanjut=${encodeURIComponent(location.hash)}`);
    throw e;
  }
  const p = data.pelajaran;
  if (p.kursus_id !== kursusId) return void (location.hash = ke(p.kursus_id, p.id));
  ctx.judul(p.judul);
  renderPemutar(ctx.app, kur.kursus, data, kur.bab, false);
}

/** Pratinjau admin: bentuk dan kode penyaji sama dengan pemutar peserta, tanpa mencatat progres. */
export async function tampilPratinjau(app: HTMLElement, pelajaranId: number): Promise<void> {
  isi(app, kerangka(8));
  const data = await get<DataPelajaran & { bab: BabRingkas[]; kursus: Kursus }>(
    `/admin/lms/pelajaran/${pelajaranId}/pratinjau`,
  );
  renderPemutar(app, data.kursus, data, data.bab, true);
}

function renderPemutar(
  app: HTMLElement,
  info: Pick<Kursus, 'judul' | 'kode'>,
  data: DataPelajaran,
  bab: BabRingkas[],
  pratinjau: boolean,
): void {
  const p = data.pelajaran;
  const kursusId = p.kursus_id;
  const tautan = (id: number): string => (pratinjau ? `#/pratinjau/${id}` : ke(kursusId, id));
  const asalKursus = pratinjau ? `#/penyusun/${kursusId}` : `#/kursus/${kursusId}`;

  const selesai = new Set(data.progres.selesai);
  let sudahSelesai = p.selesai;
  const sisi = h('nav', {
    class: 'pemutar__sisi',
    id: 'pemutar-sisi',
    'aria-label': 'Daftar pelajaran',
  });
  const tutup = h(
    'button',
    { class: 'tombol tombol--polos tombol--kecil pemutar__tutup', type: 'button' },
    ikon(IKON.silang),
    'Tutup',
  ) as HTMLButtonElement;
  const scrim = h('div', { class: 'pemutar__scrim', hidden: true });
  const buka = h(
    'button',
    {
      class: 'tombol tombol--kecil pemutar__buka',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'pemutar-sisi',
    },
    ikon(IKON.menu),
    'Daftar pelajaran',
  ) as HTMLButtonElement;
  const atur = (terbuka: boolean): void => {
    sisi.classList.toggle('terbuka', terbuka);
    scrim.hidden = !terbuka;
    buka.setAttribute('aria-expanded', String(terbuka));
    if (terbuka) tutup.focus();
    else if (document.activeElement === tutup) buka.focus();
  };
  buka.addEventListener('click', () => atur(true));
  tutup.addEventListener('click', () => atur(false));
  scrim.addEventListener('click', () => atur(false));
  sisi.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) atur(false);
  });
  // Esc menutup laci dari mana pun fokusnya; pendengar dilepas bila halaman sudah berganti.
  const tekanEsc = (e: KeyboardEvent): void => {
    if (!sisi.isConnected) return document.removeEventListener('keydown', tekanEsc);
    if (e.key === 'Escape' && sisi.classList.contains('terbuka')) atur(false);
  };
  document.addEventListener('keydown', tekanEsc);

  const gambarSisi = (): void => {
    const persen = Math.round((selesai.size / Math.max(1, data.progres.total)) * 100);
    isi(
      sisi,
      tutup,
      h('p', { class: 'pemutar__kursus' }, h('a', { href: asalKursus }, info.judul)),
      bilahProgres(persen, 'Kemajuan kursus'),
      h(
        'p',
        { class: 'isian__bantu' },
        `${selesai.size} dari ${data.progres.total} pelajaran selesai`,
      ),
      silabus(kursusId, bab, selesai, p.id, { tautan, evaluasi: !pratinjau }),
    );
  };

  const badan = h('div', { class: 'pemutar__isi' });
  const aksi = h('div', { class: 'pemutar__aksi' });
  const capaian = h('div', { 'aria-live': 'polite' });
  const babIni = bab.find((b) => b.pelajaran.some((x) => x.id === p.id));
  const semuaSelesai = (): boolean => selesai.size >= data.progres.total && data.progres.total > 0;

  /** Mencatat selesai di server lalu memberi umpan capaian (bab tuntas, kursus tuntas). */
  const catatSelesai = async (): Promise<void> => {
    if (sudahSelesai || pratinjau) return;
    await kirim('POST', `/lms/saya/progres/${p.id}`);
    selesai.add(p.id);
    sudahSelesai = true;
    gambarSisi();
    rayakan();
  };
  const rayakan = (): void => {
    if (semuaSelesai()) {
      isi(
        capaian,
        h(
          'section',
          { class: 'panel panel--capaian', 'aria-labelledby': 'j-capaian' },
          h('h2', { id: 'j-capaian' }, 'Selamat, semua pelajaran selesai'),
          h(
            'p',
            null,
            'Langkah berikutnya: kerjakan evaluasi bab dan ujian akhir di halaman kursus untuk memperoleh sertifikat.',
          ),
          h(
            'a',
            { class: 'tombol tombol--primer', href: asalKursus },
            'Ke evaluasi dan ujian akhir',
          ),
        ),
      );
    } else if (babIni && babIni.pelajaran.every((x) => selesai.has(x.id))) {
      toast(`Bab ${babIni.urutan} selesai. Lanjutkan ke bab berikutnya.`, 'berhasil', 5000);
    }
  };

  const gambarAksi = (): void => {
    const tandai = h(
      'button',
      { class: 'tombol', type: 'button' },
      ikon(IKON.centang),
      'Tandai selesai',
    ) as HTMLButtonElement;
    tandai.addEventListener(
      'click',
      () =>
        void sibuk(tandai, async () => {
          try {
            await catatSelesai();
            gambarAksi();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal menyimpan kemajuan.', 'galat', 8000);
          }
        }),
    );
    if (pratinjau) tandai.disabled = true;
    const tengah =
      p.jenis === 'latihan'
        ? h(
            'span',
            { class: sudahSelesai ? 'lencana lencana--hijau' : 'isian__bantu' },
            sudahSelesai
              ? 'Latihan lulus'
              : pratinjau
                ? 'Pratinjau: progres tidak dicatat'
                : 'Selesai setelah lulus latihan',
          )
        : sudahSelesai
          ? h('span', { class: 'lencana lencana--hijau' }, 'Selesai')
          : tandai;

    // "Berikutnya" pada materi non-latihan sekaligus menandai selesai, agar peserta cukup satu klik.
    let berikut: HTMLElement;
    if (data.berikutnya !== null) {
      const href = tautan(data.berikutnya);
      const a = h(
        'a',
        { class: 'tombol tombol--primer', href },
        'Berikutnya',
        ikon(IKON.kanan),
      ) as HTMLAnchorElement;
      if (!pratinjau && !sudahSelesai && p.jenis !== 'latihan')
        a.addEventListener('click', (e) => {
          e.preventDefault();
          void catatSelesai()
            .catch(() => toast('Kemajuan belum tersimpan. Coba tandai lagi nanti.', 'galat', 6000))
            .finally(() => (location.hash = href));
        });
      berikut = a;
    } else {
      berikut = h(
        'a',
        { class: 'tombol tombol--primer', href: asalKursus },
        pratinjau ? 'Kembali ke penyusun' : 'Ke halaman kursus',
      );
    }
    isi(
      aksi,
      data.sebelumnya !== null
        ? h('a', { class: 'tombol', href: tautan(data.sebelumnya) }, ikon(IKON.kiri), 'Sebelumnya')
        : h('span'),
      tengah,
      berikut,
    );
  };

  isi(
    badan,
    kontenPelajaran(
      p,
      data,
      pratinjau
        ? `/admin/lms/pelajaran/${p.id}/pratinjau/latihan`
        : `/lms/pelajaran/${p.id}/latihan`,
      (lulus) => {
        if (!lulus || pratinjau) return;
        const baru = !sudahSelesai;
        selesai.add(p.id);
        sudahSelesai = true;
        gambarSisi();
        gambarAksi();
        if (baru) rayakan();
      },
    ),
  );
  gambarSisi();
  gambarAksi();

  isi(
    app,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      pratinjau
        ? h('a', { href: '#/penyusun' }, 'Penyusun kursus')
        : h('a', { href: '#/' }, 'Ruang Belajar'),
      ' / ',
      h('a', { href: asalKursus }, info.kode),
      ` / ${p.bab_judul}`,
    ),
    h(
      'div',
      { class: 'pemutar' },
      sisi,
      scrim,
      h(
        'div',
        { class: 'pemutar__utama' },
        buka,
        h(
          'header',
          { class: 'pemutar__kepala' },
          h(
            'p',
            { class: 'meta-baris' },
            ikonJenis(p.jenis),
            [
              LABEL_JENIS_PELAJARAN[p.jenis],
              p.durasi_menit ? menit(p.durasi_menit) : '',
              p.wajib ? '' : 'opsional',
            ]
              .filter(Boolean)
              .join(', '),
          ),
          h('h1', { tabindex: -1, id: 'judul-pelajaran' }, p.judul),
        ),
        badan,
        aksi,
        capaian,
      ),
    ),
  );
  document.getElementById('judul-pelajaran')?.focus({ preventScroll: true });
}

function kontenPelajaran(
  p: DataPelajaran['pelajaran'],
  d: DataPelajaran,
  endpointLatihan: string,
  saatLatihan: (lulus: boolean) => void,
): Node {
  switch (p.jenis) {
    case 'video': {
      const id = idVideoYoutube(String(p.isi.url ?? ''));
      if (!id) return h('p', { class: 'pesan pesan--galat' }, 'Tautan video tidak valid.');
      return h(
        'figure',
        { class: 'pemutar__video' },
        h('iframe', {
          class: 'video',
          src: urlEmbedYoutube(id),
          title: p.judul,
          loading: 'lazy',
          allow: 'encrypted-media; picture-in-picture',
          allowfullscreen: true,
          referrerpolicy: 'strict-origin-when-cross-origin',
        }),
        p.isi.durasi
          ? h('figcaption', { class: 'isian__bantu' }, `Durasi ${String(p.isi.durasi)}`)
          : null,
      );
    }
    case 'bacaan':
      return markdown(String(p.isi.markdown ?? ''));
    case 'pdf': {
      const url = String(p.isi.url ?? '');
      return h(
        'div',
        { class: 'panel pemutar__dokumen' },
        h('p', null, 'Dokumen ini dibuka di tab baru.'),
        h(
          'p',
          { class: 'isian__bantu' },
          [
            p.isi.penerbit ? String(p.isi.penerbit) : '',
            p.isi.halaman ? `${String(p.isi.halaman)} halaman` : '',
          ]
            .filter(Boolean)
            .join(', '),
        ),
        /^https:\/\//.test(url)
          ? h(
              'a',
              {
                class: 'tombol tombol--primer',
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              ikon(IKON.luar),
              'Buka dokumen',
            )
          : null,
      );
    }
    case 'latihan':
      return formLatihan(p, d, endpointLatihan, saatLatihan);
  }
}

/**
 * Latihan bertahap: satu soal per layar dengan penanda nomor, lalu semua soal ditinjau bersama
 * pembahasannya setelah diperiksa server. Kunci jawaban tidak pernah ada di browser (ADR-0004).
 */
function formLatihan(
  p: DataPelajaran['pelajaran'],
  _d: DataPelajaran,
  endpoint: string,
  saatLatihan: (lulus: boolean) => void,
): HTMLElement {
  const soal = p.soal ?? [];
  const ambang = Number(p.isi.nilai_lulus ?? 60);
  if (soal.length === 0) return h('p', { class: 'pesan' }, 'Soal latihan ini belum tersedia.');
  const n = soal.length;
  let aktif = 0;
  let tinjau = false;

  const hasil = h('div', { 'aria-live': 'polite' });
  const status = h('p', { class: 'latihan__status' });
  const titik = h('ol', { class: 'latihan__titik', 'aria-label': 'Nomor soal' });
  const kotak = soal.map((s, i) =>
    h(
      'fieldset',
      { class: 'latihan__soal', 'data-soal': s.id },
      h('legend', null, `${i + 1}. ${s.pertanyaan}`),
      s.opsi.map((o) =>
        h(
          'label',
          { class: 'latihan__opsi' },
          h('input', { type: 'radio', name: `s${s.id}`, value: o.id }),
          h('span', null, o.text),
        ),
      ),
      h('div', { class: 'latihan__umpan', 'data-umpan': s.id }),
    ),
  ) as HTMLFieldSetElement[];

  const sebelumnya = h(
    'button',
    { class: 'tombol', type: 'button' },
    ikon(IKON.kiri),
    'Soal sebelumnya',
  ) as HTMLButtonElement;
  const lanjut = h(
    'button',
    { class: 'tombol tombol--primer', type: 'button' },
    'Soal berikutnya',
    ikon(IKON.kanan),
  ) as HTMLButtonElement;
  const periksa = h(
    'button',
    { class: 'tombol tombol--primer', type: 'submit' },
    'Periksa jawaban',
  ) as HTMLButtonElement;
  const ulangi = h(
    'button',
    { class: 'tombol', type: 'button' },
    'Ulangi latihan',
  ) as HTMLButtonElement;

  const terjawab = (i: number): boolean =>
    Boolean(kotak[i]!.querySelector<HTMLInputElement>('input:checked'));
  const jumlahTerjawab = (): number => soal.filter((_, i) => terjawab(i)).length;

  const gambar = (fokus = false): void => {
    kotak.forEach((k, i) => (k.hidden = !tinjau && i !== aktif));
    isi(
      titik,
      soal.map((_, i) => {
        const kelas = ['latihan__nomor'];
        if (i === aktif && !tinjau) kelas.push('aktif');
        if (terjawab(i)) kelas.push('terjawab');
        const b = h(
          'button',
          {
            type: 'button',
            class: kelas.join(' '),
            'aria-label': `Soal ${i + 1}${terjawab(i) ? ', sudah dijawab' : ', belum dijawab'}`,
            'aria-current': i === aktif && !tinjau ? 'step' : null,
          },
          String(i + 1),
        ) as HTMLButtonElement;
        b.addEventListener('click', () => {
          if (tinjau) return void kotak[i]!.scrollIntoView({ block: 'center' });
          aktif = i;
          gambar(true);
        });
        return h('li', null, b);
      }),
    );
    status.textContent = tinjau
      ? `Hasil pemeriksaan ${n} soal`
      : `Soal ${aktif + 1} dari ${n}, ${jumlahTerjawab()} terjawab`;
    sebelumnya.hidden = tinjau || aktif === 0;
    lanjut.hidden = tinjau || aktif === n - 1;
    periksa.hidden = tinjau || (aktif !== n - 1 && jumlahTerjawab() < n);
    ulangi.hidden = !tinjau;
    if (fokus && !tinjau) kotak[aktif]!.querySelector<HTMLInputElement>('input')?.focus();
  };

  sebelumnya.addEventListener('click', () => {
    aktif = Math.max(0, aktif - 1);
    gambar(true);
  });
  lanjut.addEventListener('click', () => {
    aktif = Math.min(n - 1, aktif + 1);
    gambar(true);
  });
  ulangi.addEventListener('click', () => {
    for (const k of kotak) {
      k.querySelectorAll<HTMLInputElement>('input').forEach((x) => {
        x.checked = false;
        x.disabled = false;
      });
      k.classList.remove('benar', 'salah');
      isi(k.querySelector('[data-umpan]')!);
    }
    isi(hasil);
    tinjau = false;
    aktif = 0;
    gambar(true);
  });

  const form = h(
    'form',
    { class: 'latihan', novalidate: true },
    p.isi.petunjuk ? h('p', null, String(p.isi.petunjuk)) : null,
    h(
      'p',
      { class: 'isian__bantu' },
      `Nilai minimal ${ambang}. Latihan dapat diulang tanpa batas.`,
    ),
    h('div', { class: 'latihan__kepala' }, status, titik),
    kotak,
    hasil,
    h('div', { class: 'baris-tombol latihan__tombol' }, sebelumnya, lanjut, periksa, ulangi),
  ) as HTMLFormElement;

  // Memilih jawaban langsung memperbarui penanda nomor dan menampilkan tombol periksa bila semua terjawab.
  form.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).type === 'radio' && !tinjau) gambar();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (tinjau) return;
    const jawaban: Record<string, string> = {};
    for (const s of soal) {
      const dipilih = form.querySelector<HTMLInputElement>(`input[name="s${s.id}"]:checked`);
      if (dipilih) jawaban[String(s.id)] = dipilih.value;
    }
    const kurang = n - Object.keys(jawaban).length;
    if (kurang > 0) {
      aktif = soal.findIndex((_, i) => !terjawab(i));
      gambar(true);
      isi(
        hasil,
        h(
          'p',
          { class: 'pesan pesan--peringatan', role: 'alert' },
          `Masih ada ${kurang} soal yang belum dijawab.`,
        ),
      );
      return;
    }
    void sibuk(periksa, async () => {
      try {
        const r = await kirim<HasilLatihan & { selesai: boolean }>('POST', endpoint, { jawaban });
        for (const x of r.hasil) {
          const k = kotak.find((el) => el.dataset.soal === String(x.id));
          if (!k) continue;
          k.classList.add(x.benar ? 'benar' : 'salah');
          k.querySelectorAll<HTMLInputElement>('input').forEach((i) => (i.disabled = true));
          isi(
            k.querySelector('[data-umpan]')!,
            h(
              'p',
              { class: x.benar ? 'umpan umpan--benar' : 'umpan umpan--salah' },
              x.benar ? 'Benar.' : 'Belum tepat.',
              x.pembahasan ? ` ${x.pembahasan}` : '',
            ),
          );
        }
        tinjau = true;
        gambar();
        isi(
          hasil,
          h(
            'div',
            {
              class: `latihan__skor ${r.lulus ? 'latihan__skor--lulus' : 'latihan__skor--ulang'}`,
              role: 'status',
            },
            h(
              'strong',
              { class: 'latihan__angka', 'aria-hidden': 'true' },
              String(Math.round(r.nilai)),
            ),
            h(
              'p',
              null,
              `Nilai ${r.nilai} (${r.benar} dari ${r.total} benar). `,
              r.lulus
                ? 'Lulus, pelajaran ini selesai.'
                : `Nilai minimal ${r.ambang}. Tinjau pembahasan di atas lalu ulangi latihan.`,
            ),
          ),
        );
        hasil.scrollIntoView({ block: 'nearest' });
        saatLatihan(r.lulus);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Latihan tidak dapat diperiksa.', 'galat', 8000);
      }
    });
  });
  gambar();
  return form;
}

/* ----------------------------- Kursus saya ----------------------------- */

export interface KursusSaya {
  id: string;
  kode: string;
  judul: string;
  level: LevelKursus;
  gambar_url: string | null;
  pelajaran_total: number;
  pelajaran_selesai: number;
  persen: number;
  lanjut_pelajaran_id: number | null;
  status: 'berjalan' | 'selesai';
  sertifikat: { nomor: string; kode_verifikasi: string; terbit_at: string; status: string } | null;
  terakhir_belajar: string | null;
}

export async function halamanSaya(ctx: Konteks): Promise<void> {
  ctx.judul('Kursus saya');
  isi(ctx.app, kerangka(5));
  let data: { kursus: KursusSaya[] };
  try {
    data = await get<{ kursus: KursusSaya[] }>('/lms/saya/kursus');
  } catch (e) {
    if (e instanceof ApiError && (e.kode === 'profil' || e.status === 403))
      return void (location.hash = `#/akun?lanjut=${encodeURIComponent('#/saya')}`);
    throw e;
  }
  const kartu = (k: KursusSaya): HTMLElement =>
    h(
      'article',
      { class: 'panel kursus-saya' },
      h(
        'div',
        null,
        h('h3', null, h('a', { href: `#/kursus/${k.id}` }, k.judul)),
        h(
          'p',
          { class: 'isian__bantu' },
          `${k.pelajaran_selesai} dari ${k.pelajaran_total} pelajaran selesai`,
        ),
        bilahProgres(k.persen, `Kemajuan ${k.judul}`),
      ),
      h(
        'div',
        { class: 'baris-tombol' },
        k.status === 'berjalan' && k.lanjut_pelajaran_id !== null
          ? h(
              'a',
              {
                class: 'tombol tombol--primer tombol--kecil',
                href: ke(k.id, k.lanjut_pelajaran_id),
              },
              'Lanjutkan',
            )
          : h('a', { class: 'tombol tombol--kecil', href: `#/kursus/${k.id}` }, 'Buka kursus'),
        k.sertifikat
          ? h(
              'a',
              {
                class: 'tombol tombol--kecil',
                href: `#/sertifikat/${k.sertifikat.kode_verifikasi}`,
              },
              'Sertifikat',
            )
          : null,
      ),
    );
  const bagian = (
    id: string,
    judul: string,
    daftar: KursusSaya[],
    kosongTeks: string,
  ): HTMLElement =>
    h(
      'section',
      { class: 'jarak-atas', 'aria-labelledby': id },
      h('h2', { id }, judul),
      daftar.length
        ? h('div', { class: 'daftar-kursus-saya' }, daftar.map(kartu))
        : h('p', { class: 'isian__bantu' }, kosongTeks),
    );
  const berjalan = data.kursus.filter((k) => k.status === 'berjalan');
  const tamat = data.kursus.filter((k) => k.status === 'selesai');
  isi(
    ctx.app,
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, 'Kursus saya'),
      h('p', null, 'Kursus yang sedang dan sudah Anda ikuti.'),
    ),
    data.kursus.length === 0
      ? kosong(
          'Anda belum mengikuti kursus',
          'Pilih kursus di katalog lalu mulai pelajaran pertama.',
          h('a', { class: 'tombol tombol--primer', href: '#/' }, 'Lihat katalog'),
        )
      : [
          bagian(
            'j-berjalan',
            'Sedang berjalan',
            berjalan,
            'Tidak ada kursus yang sedang berjalan.',
          ),
          bagian('j-selesai', 'Selesai', tamat, 'Belum ada kursus yang selesai.'),
        ],
  );
}
