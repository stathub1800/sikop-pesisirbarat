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

function kartuKursus(k: Kursus): HTMLElement {
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

  const gambar = (): void => {
    const hasil = kursus.filter((k) => cocokSaringan(k, f));
    jumlah.textContent = `${hasil.length} dari ${kursus.length} kursus`;
    isi(
      daftar,
      hasil.length
        ? hasil.map(kartuKursus)
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
    h(
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
    jumlah,
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
  tautPelajaran = true,
): HTMLElement {
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
              tautPelajaran
                ? h(
                    'a',
                    { href: ke(kursusId, p.id), 'aria-current': p.id === aktif ? 'page' : null },
                    isiBaris,
                  )
                : h('div', { class: 'silabus__baris' }, isiBaris),
            );
          }),
          b.modul_id
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

  const selesai = new Set(data.progres.selesai);
  let sudahSelesai = p.selesai;
  const bab = kur.bab;
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
      h(
        'p',
        { class: 'pemutar__kursus' },
        h('a', { href: `#/kursus/${kursusId}` }, kur.kursus.judul),
      ),
      bilahProgres(persen, 'Kemajuan kursus'),
      h(
        'p',
        { class: 'isian__bantu' },
        `${selesai.size} dari ${data.progres.total} pelajaran selesai`,
      ),
      silabus(kursusId, bab, selesai, p.id),
    );
  };

  const badan = h('div', { class: 'pemutar__isi' });
  const aksi = h('div', { class: 'pemutar__aksi' });
  const gambarAksi = (): void => {
    const tandai = h(
      'button',
      { class: 'tombol tombol--primer', type: 'button' },
      'Tandai selesai',
    ) as HTMLButtonElement;
    tandai.addEventListener(
      'click',
      () =>
        void sibuk(tandai, async () => {
          try {
            await kirim('POST', `/lms/saya/progres/${p.id}`);
            selesai.add(p.id);
            sudahSelesai = true;
            gambarSisi();
            gambarAksi();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal menyimpan kemajuan.', 'galat', 8000);
          }
        }),
    );
    const tengah =
      p.jenis === 'latihan'
        ? h(
            'span',
            { class: sudahSelesai ? 'lencana lencana--hijau' : 'isian__bantu' },
            sudahSelesai ? 'Latihan lulus' : 'Selesai setelah lulus latihan',
          )
        : sudahSelesai
          ? h('span', { class: 'lencana lencana--hijau' }, 'Selesai')
          : tandai;
    isi(
      aksi,
      data.sebelumnya !== null
        ? h(
            'a',
            { class: 'tombol', href: ke(kursusId, data.sebelumnya) },
            ikon(IKON.kiri),
            'Sebelumnya',
          )
        : h('span'),
      tengah,
      data.berikutnya !== null
        ? h(
            'a',
            { class: 'tombol tombol--primer', href: ke(kursusId, data.berikutnya) },
            'Berikutnya',
            ikon(IKON.kanan),
          )
        : h(
            'a',
            { class: 'tombol tombol--primer', href: `#/kursus/${kursusId}` },
            'Ke halaman kursus',
          ),
    );
  };

  isi(
    badan,
    kontenPelajaran(p, data, (lulus) => {
      if (!lulus) return;
      selesai.add(p.id);
      sudahSelesai = true;
      gambarSisi();
      gambarAksi();
    }),
  );
  gambarSisi();
  gambarAksi();

  isi(
    ctx.app,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/' }, 'Ruang Belajar'),
      ' / ',
      h('a', { href: `#/kursus/${kursusId}` }, kur.kursus.kode),
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
      ),
    ),
  );
  document.getElementById('judul-pelajaran')?.focus({ preventScroll: true });
}

function kontenPelajaran(
  p: DataPelajaran['pelajaran'],
  d: DataPelajaran,
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
      return formLatihan(p, d, saatLatihan);
  }
}

function formLatihan(
  p: DataPelajaran['pelajaran'],
  _d: DataPelajaran,
  saatLatihan: (lulus: boolean) => void,
): HTMLElement {
  const soal = p.soal ?? [];
  const ambang = Number(p.isi.nilai_lulus ?? 60);
  const hasil = h('div', { 'aria-live': 'polite' });
  if (soal.length === 0) return h('p', { class: 'pesan' }, 'Soal latihan ini belum tersedia.');
  const form = h(
    'form',
    { class: 'latihan', novalidate: true },
    p.isi.petunjuk ? h('p', null, String(p.isi.petunjuk)) : null,
    h(
      'p',
      { class: 'isian__bantu' },
      `Nilai minimal ${ambang}. Latihan dapat diulang tanpa batas.`,
    ),
    soal.map((s, i) =>
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
    ),
    hasil,
    h(
      'div',
      { class: 'baris-tombol' },
      h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Periksa jawaban'),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const jawaban: Record<string, string> = {};
    for (const s of soal) {
      const dipilih = form.querySelector<HTMLInputElement>(`input[name="s${s.id}"]:checked`);
      if (dipilih) jawaban[String(s.id)] = dipilih.value;
    }
    if (Object.keys(jawaban).length < soal.length) {
      isi(
        hasil,
        h(
          'p',
          { class: 'pesan pesan--peringatan', role: 'alert' },
          'Jawab semua soal sebelum memeriksa.',
        ),
      );
      return;
    }
    void sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        const r = await kirim<HasilLatihan & { selesai: boolean }>(
          'POST',
          `/lms/pelajaran/${p.id}/latihan`,
          { jawaban },
        );
        for (const x of r.hasil) {
          const u = form.querySelector(`[data-umpan="${x.id}"]`);
          if (u)
            isi(
              u,
              h(
                'p',
                { class: x.benar ? 'umpan umpan--benar' : 'umpan umpan--salah' },
                x.benar ? 'Benar.' : 'Belum tepat.',
                x.pembahasan ? ` ${x.pembahasan}` : '',
              ),
            );
        }
        isi(
          hasil,
          h(
            'p',
            {
              class: r.lulus ? 'pesan pesan--berhasil' : 'pesan pesan--peringatan',
              role: 'status',
            },
            `Nilai ${r.nilai} (${r.benar} dari ${r.total} benar). `,
            r.lulus
              ? 'Lulus, pelajaran ini selesai.'
              : `Nilai minimal ${r.ambang}. Tinjau pembahasan lalu coba lagi.`,
          ),
        );
        saatLatihan(r.lulus);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Latihan tidak dapat diperiksa.', 'galat', 8000);
      }
    });
  });
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
