/**
 * Ruang Belajar: aplikasi satu halaman berbasis hash.
 *   #/                      katalog kursus
 *   #/kursus/:id            ringkasan kursus dan urutan modul
 *   #/modul/:id             materi modul, pre-test dan post-test
 *   #/ujian/:id             ujian berjalan (id percobaan dari server)
 *   #/hasil/:id             hasil dan pembahasan
 *   #/masuk, #/akun         masuk dan profil peserta
 *   #/sertifikat/:kode      sertifikat siap cetak
 *
 * Penilaian, waktu, dan sertifikat sepenuhnya di server; halaman ini hanya menampilkan.
 */
import qrcode from 'qrcode-generator';
import { formatAngka, formatTanggal, LABEL_UJIAN, type JenisUjian } from '@sikop/shared';
import '../styles/belajar.css';
import { keluar, saya, tombolMasuk } from '../lib/akun.ts';
import { ApiError, get, kirim } from '../lib/api.ts';
import { $, h, ikon, IKON, isi } from '../lib/dom.ts';
import { situs } from '../lib/situs.ts';
import {
  galat,
  kerangka,
  konfirmasi,
  kosong,
  lencanaStatus,
  sibuk,
  tampilkanGalatForm,
  toast,
} from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

/* ------------------------------- Tipe ------------------------------- */

interface Kursus {
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
}
interface Modul {
  id: number;
  kursus_id: string;
  nomor: number;
  kode: string;
  judul: string;
  subjudul: string;
  deskripsi: string;
  estimasi: string;
  nilai_lulus: number;
  ringkasan: string;
  video: { judul: string; url: string; durasi?: string }[];
  kompetensi: { judul: string; uraian: string }[];
  sumber: { judul: string; format: string; url: string; penerbit?: string }[];
  jumlah_soal: Partial<Record<JenisUjian, number>>;
}
interface Progres {
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
    percobaan: { id: string; nilai: number; lulus: boolean; selesai_at: string }[];
    percobaan_24_jam: number;
    lulus: boolean;
  };
  sertifikat: { nomor: string; kode_verifikasi: string; terbit_at: string; status: string } | null;
}
interface Ujian {
  id: string;
  jenis: JenisUjian;
  kursus_id: string;
  modul_id: number | null;
  batas_at: string;
  waktu_server: string;
  jawaban: Record<string, string>;
  soal: { id: number; pertanyaan: string; opsi: { id: string; text: string }[] }[];
}
interface HasilSerah {
  percobaan: {
    id: string;
    jenis: JenisUjian;
    kursus_id: string;
    modul_id: number | null;
    benar: number;
    total: number;
    nilai: number;
    lulus: boolean | null;
  };
  sertifikat?: { status: string; kode_verifikasi?: string };
}

mulaiHalaman();
const app = $('#app-belajar');
let hentikanUjian: (() => void) | null = null;

/* ------------------------------ Router ------------------------------ */

async function rute(): Promise<void> {
  hentikanUjian?.();
  hentikanUjian = null;
  const jalur = location.hash.replace(/^#/, '').split('?')[0] ?? '';
  const [, bagian = '', id = ''] = jalur.split('/');
  window.scrollTo(0, 0);
  try {
    switch (bagian) {
      case 'kursus':
        return await halamanKursus(decodeURIComponent(id));
      case 'modul':
        return await halamanModul(Number(id));
      case 'ujian':
        return await halamanUjian(decodeURIComponent(id));
      case 'hasil':
        return await halamanHasil(decodeURIComponent(id));
      case 'masuk':
        return await halamanMasuk();
      case 'akun':
        return await halamanAkun();
      case 'sertifikat':
        return await halamanSertifikat(decodeURIComponent(id));
      default:
        return await halamanKatalog();
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401)
      return void (location.hash = `#/masuk?lanjut=${encodeURIComponent(location.hash)}`);
    isi(
      app,
      galat(e, () => void rute()),
    );
  }
}
window.addEventListener('hashchange', () => void rute());

const lanjutSetelahMasuk = (): string =>
  new URLSearchParams(location.hash.split('?')[1] ?? '').get('lanjut') ?? '#/';
const judulHalaman = (t: string): void => {
  document.title = `${t} | Ruang Belajar SIKOP`;
};

/* ------------------------------ Katalog ------------------------------ */

async function halamanKatalog(): Promise<void> {
  judulHalaman('Ruang Belajar');
  isi(app, kerangka(6));
  const [{ kursus }, s] = await Promise.all([get<{ kursus: Kursus[] }>('/lms/kursus'), saya()]);
  isi(
    app,
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, 'Ruang Belajar'),
      h(
        'p',
        null,
        'Pembinaan statistik sektoral untuk walidata dan produsen data perangkat daerah.',
      ),
    ),
    s.akun
      ? null
      : h(
          'p',
          { class: 'pesan' },
          'Materi dapat dibaca tanpa masuk. Untuk mengerjakan ujian dan memperoleh sertifikat, ',
          h('a', { href: '#/masuk' }, 'masuk dengan akun Google'),
          '.',
        ),
    kursus.length === 0
      ? kosong(
          'Belum ada program belajar',
          'Program pembinaan akan tampil di sini setelah diterbitkan pengelola.',
        )
      : kursus.map((k) =>
          h(
            'section',
            { class: 'panel' },
            h('h2', null, h('a', { href: `#/kursus/${k.id}` }, k.judul)),
            h('p', null, k.deskripsi),
            h(
              'p',
              { class: 'isian__bantu' },
              `${formatAngka(k.jumlah_modul ?? 0)} modul tersedia. Estimasi ${k.estimasi}. Kelulusan ujian akhir minimal ${k.nilai_lulus_akhir}.`,
            ),
            h('a', { class: 'tombol tombol--primer', href: `#/kursus/${k.id}` }, 'Buka program'),
          ),
        ),
  );
}

/* ------------------------------ Kursus ------------------------------ */

async function halamanKursus(id: string): Promise<void> {
  isi(app, kerangka(8));
  const [data, s] = await Promise.all([
    get<{ kursus: Kursus; modul: Modul[]; jumlah_soal_akhir_tersedia: number }>(
      `/lms/kursus/${encodeURIComponent(id)}`,
    ),
    saya(),
  ]);
  const progres = s.peserta
    ? await get<Progres>(`/lms/saya/progres/${encodeURIComponent(id)}`)
    : null;
  const { kursus, modul } = data;
  judulHalaman(kursus.judul);
  const pm = (mid: number): Progres['modul'][number] | undefined =>
    progres?.modul.find((m) => m.id === mid);
  const semuaLulus = Boolean(progres?.modul.length) && progres!.modul.every((m) => m.lulus);

  isi(
    app,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/' }, 'Ruang Belajar'),
      ` / ${kursus.kode}`,
    ),
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, kursus.judul),
      h('p', null, kursus.subjudul || kursus.deskripsi),
    ),
    statusPeserta(s),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-modul' },
      h(
        'div',
        { class: 'panel__kepala' },
        h('h2', { id: 'j-modul' }, 'Urutan modul'),
        h(
          'span',
          { class: 'isian__bantu' },
          'Kerjakan pre-test, pelajari materi, lalu lulus post-test di setiap modul.',
        ),
      ),
      modul.length === 0
        ? kosong('Modul belum tersedia', 'Modul untuk program ini sedang disiapkan.')
        : h(
            'ol',
            { class: 'modul-daftar' },
            modul.map((m) => {
              const p = pm(m.id);
              return h(
                'li',
                { class: p?.lulus ? 'lulus' : null },
                h(
                  'div',
                  null,
                  h('h3', null, h('a', { href: `#/modul/${m.id}` }, m.judul)),
                  h(
                    'p',
                    null,
                    p
                      ? p.lulus
                        ? `Lulus, nilai terbaik ${formatAngka(p.post_terbaik, 0)}`
                        : p.pre
                          ? 'Pre-test selesai. Lanjutkan ke materi dan post-test.'
                          : 'Belum dimulai'
                      : `${m.estimasi}. Lulus post-test minimal ${m.nilai_lulus}.`,
                  ),
                ),
                h(
                  'a',
                  { class: 'tombol tombol--kecil', href: `#/modul/${m.id}` },
                  p?.lulus ? 'Tinjau' : 'Buka modul',
                ),
              );
            }),
          ),
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-akhir' },
      h('h2', { id: 'j-akhir' }, 'Ujian akhir dan sertifikat'),
      h(
        'p',
        null,
        `${formatAngka(kursus.jumlah_soal_akhir)} soal acak, ${kursus.durasi_akhir_menit} menit, kelulusan minimal ${kursus.nilai_lulus_akhir}. Maksimal 3 percobaan dalam 24 jam.`,
      ),
      bagianAkhir(kursus, progres, s, semuaLulus),
    ),
  );
}

function statusPeserta(s: Awaited<ReturnType<typeof saya>>): HTMLElement | null {
  if (!s.akun)
    return h(
      'p',
      { class: 'pesan' },
      h('a', { href: '#/masuk' }, 'Masuk'),
      ' untuk mencatat kemajuan belajar dan mengerjakan ujian.',
    );
  if (!s.peserta)
    return h(
      'p',
      { class: 'pesan pesan--peringatan' },
      'Lengkapi profil peserta sebelum mengerjakan ujian. ',
      h('a', { href: '#/akun' }, 'Lengkapi profil'),
    );
  if (s.peserta.status === 'menunggu')
    return h(
      'p',
      { class: 'pesan' },
      'Profil Anda sedang diverifikasi pengelola. Anda tetap dapat belajar dan mengerjakan ujian; sertifikat terbit setelah verifikasi.',
    );
  if (s.peserta.status === 'ditolak' || s.peserta.status === 'nonaktif')
    return h(
      'p',
      { class: 'pesan pesan--galat' },
      'Akun peserta Anda tidak aktif. Periksa catatan di ',
      h('a', { href: '#/akun' }, 'halaman akun'),
      '.',
    );
  return null;
}

function bagianAkhir(
  k: Kursus,
  p: Progres | null,
  s: Awaited<ReturnType<typeof saya>>,
  semuaLulus: boolean,
): HTMLElement {
  if (p?.sertifikat) {
    return h(
      'div',
      { class: 'pesan pesan--berhasil' },
      h(
        'p',
        null,
        h('strong', null, 'Selamat, Anda lulus. '),
        `Sertifikat ${p.sertifikat.nomor} terbit ${formatTanggal(p.sertifikat.terbit_at)}.`,
      ),
      h(
        'a',
        { class: 'tombol tombol--primer', href: `#/sertifikat/${p.sertifikat.kode_verifikasi}` },
        'Lihat dan cetak sertifikat',
      ),
    );
  }
  if (p?.akhir.lulus)
    return h(
      'p',
      { class: 'pesan' },
      'Anda lulus ujian akhir. Sertifikat akan terbit setelah profil diverifikasi dan pengelola mengaktifkan penerbitan sertifikat.',
    );
  const riwayat = p?.akhir.percobaan.length
    ? h(
        'p',
        { class: 'isian__bantu' },
        `Percobaan sebelumnya: ${p.akhir.percobaan.map((x) => formatAngka(x.nilai, 0)).join(', ')}.`,
      )
    : null;
  if (!s.peserta)
    return h(
      'div',
      null,
      h('p', { class: 'isian__bantu' }, 'Masuk dan lengkapi profil untuk mengikuti ujian akhir.'),
    );
  if (!semuaLulus)
    return h(
      'div',
      null,
      h('p', { class: 'isian__bantu' }, 'Ujian akhir terbuka setelah semua post-test modul lulus.'),
      riwayat,
    );
  return h('div', null, riwayat, tombolMulai(k.id, 'akhir', null, 'Mulai ujian akhir'));
}

function tombolMulai(
  kursusId: string,
  jenis: JenisUjian,
  modulId: number | null,
  label: string,
): HTMLButtonElement {
  const b = h(
    'button',
    { class: 'tombol tombol--primer', type: 'button' },
    label,
  ) as HTMLButtonElement;
  b.addEventListener('click', async () => {
    if (
      jenis === 'akhir' &&
      !(await konfirmasi(
        'Mulai ujian akhir?',
        'Waktu berjalan sejak Anda menekan Mulai dan tetap berjalan walau halaman ditutup. Pastikan koneksi stabil.',
        'Mulai',
      ))
    )
      return;
    await sibuk(b, async () => {
      try {
        const u = await kirim<Ujian>('POST', '/lms/ujian', {
          kursus_id: kursusId,
          jenis,
          modul_id: modulId,
        });
        sessionStorage.setItem(`ujian:${u.id}`, '1');
        location.hash = `#/ujian/${u.id}`;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) location.hash = '#/masuk';
        else if (e instanceof ApiError && e.kode === 'profil') location.hash = '#/akun';
        else toast(e instanceof Error ? e.message : 'Ujian tidak dapat dimulai.', 'galat', 8000);
      }
    });
  });
  return b;
}

/* ------------------------------ Modul ------------------------------ */

async function halamanModul(id: number): Promise<void> {
  isi(app, kerangka(10));
  // Detail modul dibaca dari kursus agar tetap satu endpoint publik yang di-cache.
  const { kursus } = await get<{ kursus: Kursus[] }>('/lms/kursus');
  let ditemukan: { k: Kursus; m: Modul; semua: Modul[] } | null = null;
  for (const k of kursus) {
    const d = await get<{ kursus: Kursus; modul: Modul[] }>(`/lms/kursus/${k.id}`);
    const m = d.modul.find((x) => x.id === id);
    if (m) {
      ditemukan = { k: d.kursus, m, semua: d.modul };
      break;
    }
  }
  if (!ditemukan)
    return void isi(
      app,
      kosong(
        'Modul tidak ditemukan',
        'Modul ini tidak tersedia atau belum diterbitkan.',
        h('a', { class: 'tombol', href: '#/' }, 'Ke Ruang Belajar'),
      ),
    );
  const { k, m, semua } = ditemukan;
  judulHalaman(m.judul);
  const s = await saya();
  const p = s.peserta
    ? (await get<Progres>(`/lms/saya/progres/${k.id}`)).modul.find((x) => x.id === m.id)
    : undefined;
  const berikut = semua.find((x) => x.nomor > m.nomor);

  const langkah = (judul: string, ket: string, aksi: Node | null): HTMLElement =>
    h(
      'div',
      null,
      h(
        'div',
        null,
        h('strong', null, judul),
        h('p', { class: 'isian__bantu', style: { margin: '0' } }, ket),
      ),
      aksi,
    );
  const aksiPre = !s.peserta
    ? h(
        'a',
        { class: 'tombol tombol--kecil', href: s.akun ? '#/akun' : '#/masuk' },
        s.akun ? 'Lengkapi profil' : 'Masuk',
      )
    : p?.pre
      ? h('a', { class: 'tombol tombol--kecil', href: `#/hasil/${p.pre.id}` }, 'Lihat hasil')
      : tombolMulai(k.id, 'pre', m.id, 'Mulai pre-test');
  const aksiPost = !s.peserta
    ? null
    : !p?.pre
      ? h('span', { class: 'isian__bantu' }, 'Setelah pre-test')
      : p.lulus && p.post_lulus_id
        ? h(
            'a',
            { class: 'tombol tombol--kecil', href: `#/hasil/${p.post_lulus_id}` },
            'Lihat pembahasan',
          )
        : tombolMulai(
            k.id,
            'post',
            m.id,
            p.post_percobaan ? 'Ulangi post-test' : 'Mulai post-test',
          );

  isi(
    app,
    h(
      'nav',
      { class: 'remah', 'aria-label': 'Remah roti' },
      h('a', { href: '#/' }, 'Ruang Belajar'),
      ' / ',
      h('a', { href: `#/kursus/${k.id}` }, k.judul),
      ` / Modul ${m.nomor}`,
    ),
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, `Modul ${m.nomor}. ${m.judul}`),
      m.subjudul ? h('p', null, m.subjudul) : null,
    ),
    h(
      'div',
      { class: 'dua-kolom' },
      h(
        'div',
        null,
        h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-materi' },
          h('h2', { id: 'j-materi' }, 'Materi'),
          h('p', null, m.deskripsi),
          m.ringkasan ? h('p', null, m.ringkasan) : null,
          m.video.length
            ? m.video.map((v) =>
                h(
                  'figure',
                  { style: { margin: '0 0 var(--s-5)' } },
                  h('iframe', {
                    class: 'video',
                    src: v.url.replace('www.youtube.com/embed', 'www.youtube-nocookie.com/embed'),
                    title: v.judul,
                    loading: 'lazy',
                    allow: 'encrypted-media; picture-in-picture',
                    allowfullscreen: true,
                    referrerpolicy: 'strict-origin-when-cross-origin',
                  }),
                  h(
                    'figcaption',
                    { class: 'isian__bantu' },
                    `${v.judul}${v.durasi ? `, ${v.durasi}` : ''}`,
                  ),
                ),
              )
            : h('p', { class: 'pesan' }, 'Video materi untuk modul ini sedang disiapkan.'),
        ),
        m.kompetensi.length
          ? h(
              'section',
              { class: 'panel', 'aria-labelledby': 'j-komp' },
              h('h2', { id: 'j-komp' }, 'Yang Anda kuasai setelah modul ini'),
              h(
                'ul',
                { class: 'kompetensi' },
                m.kompetensi.map((x) =>
                  h('li', null, h('h3', null, x.judul), h('p', null, x.uraian)),
                ),
              ),
            )
          : null,
        m.sumber.length
          ? h(
              'section',
              { class: 'panel', 'aria-labelledby': 'j-sumber' },
              h('h2', { id: 'j-sumber' }, 'Bahan bacaan'),
              h(
                'ul',
                null,
                m.sumber.map((x) =>
                  h(
                    'li',
                    null,
                    h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.judul),
                    ` (${x.format}${x.penerbit ? `, ${x.penerbit}` : ''})`,
                  ),
                ),
              ),
            )
          : null,
      ),
      h(
        'aside',
        null,
        h(
          'section',
          { class: 'panel langkah-uji', 'aria-labelledby': 'j-uji' },
          h('h2', { id: 'j-uji' }, 'Evaluasi modul'),
          langkah(
            '1. Pre-test',
            `${m.jumlah_soal.pre ?? 0} soal, 10 menit. Mengukur pemahaman awal, dikerjakan sekali.`,
            aksiPre,
          ),
          langkah(
            '2. Post-test',
            `${m.jumlah_soal.post ?? 0} soal, 15 menit. Lulus minimal ${m.nilai_lulus}.${p?.post_terbaik !== null && p?.post_terbaik !== undefined ? ` Nilai terbaik Anda ${formatAngka(p.post_terbaik, 0)}.` : ''}`,
            aksiPost,
          ),
          p?.lulus
            ? h('p', { class: 'pesan pesan--berhasil' }, 'Modul ini sudah Anda selesaikan.')
            : null,
        ),
        berikut
          ? h(
              'p',
              { class: 'jarak-atas' },
              'Berikutnya: ',
              h('a', { href: `#/modul/${berikut.id}` }, `Modul ${berikut.nomor}. ${berikut.judul}`),
            )
          : h(
              'p',
              { class: 'jarak-atas' },
              h('a', { href: `#/kursus/${k.id}` }, 'Kembali ke ringkasan program'),
            ),
      ),
    ),
  );
}

/* ------------------------------ Ujian ------------------------------ */

async function halamanUjian(id: string): Promise<void> {
  isi(app, kerangka(8));
  // Mulai ulang dengan id yang sama mengembalikan percobaan yang sedang berjalan (lanjutkan setelah muat ulang).
  const ringkas = await get<{ percobaan: HasilSerah['percobaan'] & { selesai_at: string | null } }>(
    `/lms/ujian/${encodeURIComponent(id)}`,
  );
  if (ringkas.percobaan.selesai_at) return void (location.hash = `#/hasil/${id}`);
  const u = await kirim<Ujian>('POST', '/lms/ujian', {
    kursus_id: ringkas.percobaan.kursus_id,
    jenis: ringkas.percobaan.jenis,
    modul_id: ringkas.percobaan.modul_id,
  });
  if (u.id !== id) return void (location.hash = `#/ujian/${u.id}`);
  judulHalaman(LABEL_UJIAN[u.jenis]);

  const selisih = Date.parse(u.waktu_server) - Date.now();
  const batas = Date.parse(u.batas_at);
  const jawaban: Record<string, string> = { ...u.jawaban };
  let indeks = 0;
  let selesai = false;
  let tundaSimpan = 0;

  const timer = h('span', { class: 'timer', role: 'timer', 'aria-live': 'off' });
  const statusSimpan = h('span', { class: 'simpan-status', 'aria-live': 'polite' });
  const kartu = h('section', { class: 'panel', 'aria-live': 'polite' });
  const nav = h('div', { class: 'navigator', role: 'group', 'aria-label': 'Nomor soal' });
  const tombolSerah = h(
    'button',
    { class: 'tombol tombol--primer', type: 'button' },
    'Serahkan jawaban',
  ) as HTMLButtonElement;

  const simpan = (): void => {
    clearTimeout(tundaSimpan);
    statusSimpan.textContent = 'Menyimpan…';
    tundaSimpan = window.setTimeout(async () => {
      try {
        await kirim('PUT', `/lms/ujian/${u.id}/jawaban`, { jawaban });
        statusSimpan.textContent = 'Jawaban tersimpan';
      } catch {
        statusSimpan.textContent = 'Belum tersimpan, mencoba lagi saat Anda menjawab berikutnya';
      }
    }, 800);
  };

  const gambarNav = (): void => {
    isi(
      nav,
      u.soal.map((s, i) =>
        h(
          'button',
          {
            type: 'button',
            class: jawaban[String(s.id)] ? 'terjawab' : null,
            'aria-current': String(i === indeks),
            'aria-label': `Soal ${i + 1}${jawaban[String(s.id)] ? ', sudah dijawab' : ''}`,
            onclick: () => tampilSoal(i),
          },
          String(i + 1),
        ),
      ),
    );
  };

  const tampilSoal = (i: number): void => {
    indeks = i;
    const s = u.soal[i]!;
    const nama = `soal-${s.id}`;
    isi(
      kartu,
      h('p', { class: 'isian__bantu' }, `Soal ${i + 1} dari ${u.soal.length}`),
      h(
        'fieldset',
        null,
        h('legend', { class: 'soal__teks' }, s.pertanyaan),
        h(
          'ul',
          { class: 'opsi' },
          s.opsi.map((o, j) => {
            const idInput = `${nama}-${o.id}`;
            const input = h('input', {
              type: 'radio',
              name: nama,
              id: idInput,
              value: o.id,
              checked: jawaban[String(s.id)] === o.id,
            }) as HTMLInputElement;
            input.addEventListener('change', () => {
              jawaban[String(s.id)] = o.id;
              gambarNav();
              simpan();
            });
            // Label huruf mengikuti posisi tampil, bukan id asli opsi (urutan diacak server).
            return h(
              'li',
              null,
              input,
              h(
                'label',
                { for: idInput },
                h('b', { 'aria-hidden': 'true' }, String.fromCharCode(65 + j)),
                h('span', null, o.text),
              ),
            );
          }),
        ),
      ),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h(
          'button',
          { class: 'tombol', type: 'button', disabled: i === 0, onclick: () => tampilSoal(i - 1) },
          'Sebelumnya',
        ),
        i < u.soal.length - 1
          ? h(
              'button',
              { class: 'tombol tombol--primer', type: 'button', onclick: () => tampilSoal(i + 1) },
              'Berikutnya',
            )
          : null,
      ),
    );
    gambarNav();
  };

  const serahkan = async (otomatis: boolean): Promise<void> => {
    if (selesai) return;
    if (!otomatis) {
      const sisa = u.soal.filter((s) => !jawaban[String(s.id)]).length;
      if (
        !(await konfirmasi(
          'Serahkan jawaban?',
          sisa
            ? `${sisa} soal belum dijawab dan akan dihitung salah. Jawaban tidak dapat diubah setelah diserahkan.`
            : 'Jawaban tidak dapat diubah setelah diserahkan.',
          'Serahkan',
        ))
      )
        return;
    }
    selesai = true;
    clearInterval(detak);
    clearTimeout(tundaSimpan);
    try {
      const r = await kirim<HasilSerah>('POST', `/lms/ujian/${u.id}/serahkan`, { jawaban });
      sessionStorage.removeItem(`ujian:${u.id}`);
      if (r.sertifikat?.status === 'terbit')
        toast('Sertifikat Anda telah terbit.', 'berhasil', 8000);
      location.hash = `#/hasil/${u.id}`;
    } catch (e) {
      selesai = false;
      toast(e instanceof Error ? e.message : 'Penyerahan gagal. Coba lagi.', 'galat', 8000);
    }
  };
  tombolSerah.addEventListener('click', () => void serahkan(false));

  const perbaruiTimer = (): void => {
    const sisa = Math.max(0, Math.floor((batas - (Date.now() + selisih)) / 1000));
    const mm = String(Math.floor(sisa / 60)).padStart(2, '0');
    const ss = String(sisa % 60).padStart(2, '0');
    timer.textContent = `${mm}:${ss}`;
    timer.setAttribute(
      'aria-label',
      `Sisa waktu ${Math.floor(sisa / 60)} menit ${sisa % 60} detik`,
    );
    timer.classList.toggle('kritis', sisa <= 60);
    if (sisa === 120 || sisa === 30)
      toast(`Sisa waktu ${sisa === 120 ? '2 menit' : '30 detik'}.`, 'info');
    if (sisa === 0) {
      toast('Waktu habis. Jawaban Anda diserahkan otomatis.', 'info', 8000);
      void serahkan(true);
    }
  };
  const detak = window.setInterval(perbaruiTimer, 1000);
  const peringatan = (e: BeforeUnloadEvent): void => {
    if (!selesai) e.preventDefault();
  };
  window.addEventListener('beforeunload', peringatan);
  hentikanUjian = () => {
    clearInterval(detak);
    window.removeEventListener('beforeunload', peringatan);
  };

  isi(
    app,
    h(
      'div',
      { class: 'ujian__kepala' },
      h('h1', { style: { margin: '0', fontSize: 'var(--t-xl)' } }, LABEL_UJIAN[u.jenis]),
      h('div', { class: 'baris-tombol' }, statusSimpan, ikon(IKON.jam), timer),
    ),
    h(
      'div',
      { class: 'ujian jarak-atas' },
      kartu,
      h(
        'aside',
        { class: 'panel' },
        h('h2', { style: { fontSize: 'var(--t-md)' } }, 'Navigasi soal'),
        nav,
        h('div', { class: 'jarak-atas' }, tombolSerah),
        h(
          'p',
          { class: 'isian__bantu jarak-atas' },
          'Jawaban tersimpan otomatis. Bila halaman tertutup, buka kembali untuk melanjutkan selama waktu masih tersisa.',
        ),
      ),
    ),
  );
  perbaruiTimer();
  tampilSoal(0);
}

/* ------------------------------ Hasil ------------------------------ */

async function halamanHasil(id: string): Promise<void> {
  isi(app, kerangka(6));
  const r = await get<{
    percobaan: HasilSerah['percobaan'];
    pembahasan:
      | {
          id: number;
          pertanyaan: string;
          opsi: { id: string; text: string }[];
          jawaban_anda: string | null;
          kunci: string;
          pembahasan: string | null;
        }[]
      | null;
  }>(`/lms/ujian/${encodeURIComponent(id)}`);
  const p = r.percobaan;
  judulHalaman(`Hasil ${LABEL_UJIAN[p.jenis]}`);
  const kembali = p.modul_id ? `#/modul/${p.modul_id}` : `#/kursus/${p.kursus_id}`;
  const status =
    p.jenis === 'pre'
      ? null
      : p.lulus
        ? lencanaStatus('Lulus', 'hijau')
        : lencanaStatus('Belum lulus', 'oranye');
  isi(
    app,
    h('div', { class: 'halaman__judul' }, h('h1', null, `Hasil ${LABEL_UJIAN[p.jenis]}`)),
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'kpi' },
        h(
          'div',
          null,
          h('span', { class: 'kpi__nilai' }, formatAngka(p.nilai, 0)),
          h('span', { class: 'kpi__label' }, 'nilai'),
        ),
        h(
          'div',
          null,
          h('span', { class: 'kpi__nilai' }, `${p.benar}/${p.total}`),
          h('span', { class: 'kpi__label' }, 'jawaban benar'),
        ),
      ),
      h(
        'p',
        { class: 'jarak-atas' },
        status,
        ' ',
        p.jenis === 'pre'
          ? 'Pre-test mengukur pemahaman awal dan tidak menentukan kelulusan.'
          : p.lulus
            ? 'Selamat, Anda memenuhi nilai kelulusan.'
            : 'Pelajari kembali materi, lalu ulangi setelah jeda singkat.',
      ),
      h(
        'div',
        { class: 'baris-tombol' },
        h(
          'a',
          { class: 'tombol tombol--primer', href: kembali },
          p.jenis === 'akhir' ? 'Kembali ke program' : 'Kembali ke modul',
        ),
      ),
    ),
    r.pembahasan
      ? h(
          'section',
          { class: 'panel', 'aria-labelledby': 'j-bahas' },
          h('h2', { id: 'j-bahas' }, 'Pembahasan'),
          h(
            'ol',
            { class: 'pembahasan' },
            r.pembahasan.map((s) => {
              const teks = (oid: string | null): string => {
                const i = s.opsi.findIndex((o) => o.id === oid);
                return i < 0
                  ? 'tidak dijawab'
                  : `${String.fromCharCode(65 + i)}. ${s.opsi[i]!.text}`;
              };
              const benar = s.jawaban_anda === s.kunci;
              return h(
                'li',
                null,
                h('p', null, s.pertanyaan),
                h(
                  'p',
                  { class: benar ? 'benar' : 'salah' },
                  `Jawaban Anda: ${teks(s.jawaban_anda)}`,
                ),
                benar ? null : h('p', null, `Jawaban benar: ${teks(s.kunci)}`),
                s.pembahasan ? h('p', { class: 'isian__bantu' }, s.pembahasan) : null,
              );
            }),
          ),
        )
      : p.jenis !== 'akhir'
        ? h('p', { class: 'pesan' }, 'Pembahasan terbuka setelah Anda lulus post-test modul ini.')
        : null,
  );
}

/* --------------------------- Masuk & akun --------------------------- */

async function halamanMasuk(): Promise<void> {
  judulHalaman('Masuk');
  const s = await saya(true);
  if (s.akun)
    return void (location.hash = s.peserta || s.akun.peran ? lanjutSetelahMasuk() : '#/akun');
  const wadah = h('div', { class: 'baris-tombol jarak-atas' });
  isi(
    app,
    h(
      'section',
      { class: 'panel', style: { maxWidth: '560px' } },
      h('h1', null, 'Masuk'),
      h(
        'p',
        null,
        'Gunakan akun Google Anda. SIKOP tidak menyimpan kata sandi; verifikasi dua langkah mengikuti pengaturan akun Google Anda.',
      ),
      wadah,
      h(
        'p',
        { class: 'isian__bantu jarak-atas' },
        'Dengan masuk, nama dan email akun Google Anda diproses sesuai ',
        h('a', { href: '/privasi/' }, 'kebijakan privasi'),
        '.',
      ),
    ),
  );
  await tombolMasuk(wadah, (akun) => {
    toast(`Selamat datang, ${akun.nama}.`, 'berhasil');
    location.hash = akun.peran ? lanjutSetelahMasuk() : '#/akun';
    if (akun.peran && lanjutSetelahMasuk() === '#/') location.href = '/admin/';
  });
}

async function halamanAkun(): Promise<void> {
  judulHalaman('Akun peserta');
  isi(app, kerangka(6));
  const r = await get<{
    akun: { email: string; nama: string };
    peserta: {
      nama: string;
      nip: string;
      instansi: string;
      jabatan: string;
      status: string;
      catatan: string | null;
    } | null;
  }>('/lms/saya/profil');
  const situsData = await situs();
  const ps = r.peserta;
  const STATUS: Record<string, [string, 'kuning' | 'hijau' | 'merah' | 'biru']> = {
    menunggu: ['Menunggu verifikasi', 'kuning'],
    terverifikasi: ['Terverifikasi', 'hijau'],
    ditolak: ['Ditolak', 'merah'],
    nonaktif: ['Nonaktif', 'merah'],
  };
  const form = h(
    'form',
    { novalidate: true },
    h(
      'div',
      { class: 'grid-isian' },
      h(
        'div',
        { class: 'isian' },
        h('label', { for: 'a-nama' }, 'Nama lengkap dan gelar'),
        h('input', {
          id: 'a-nama',
          name: 'nama',
          type: 'text',
          required: true,
          value: ps?.nama ?? r.akun.nama,
          autocomplete: 'name',
        }),
      ),
      h(
        'div',
        { class: 'isian' },
        h('label', { for: 'a-nip' }, 'NIP'),
        h('input', {
          id: 'a-nip',
          name: 'nip',
          type: 'text',
          inputmode: 'numeric',
          required: true,
          maxlength: 21,
          placeholder: ps ? `Tersimpan: ${ps.nip}` : '18 digit',
          autocomplete: 'off',
        }),
        h(
          'span',
          { class: 'isian__bantu' },
          ps
            ? 'Isi ulang NIP lengkap untuk menyimpan perubahan profil.'
            : 'NIP diperiksa strukturnya dan diverifikasi pengelola.',
        ),
      ),
      h(
        'div',
        { class: 'isian' },
        h('label', { for: 'a-instansi' }, 'Instansi'),
        h('input', {
          id: 'a-instansi',
          name: 'instansi',
          type: 'text',
          required: true,
          value: ps?.instansi ?? '',
          autocomplete: 'organization',
        }),
      ),
      h(
        'div',
        { class: 'isian' },
        h('label', { for: 'a-jabatan' }, 'Jabatan'),
        h('input', {
          id: 'a-jabatan',
          name: 'jabatan',
          type: 'text',
          required: true,
          value: ps?.jabatan ?? '',
          autocomplete: 'organization-title',
        }),
      ),
    ),
    h(
      'label',
      { class: 'centang' },
      h('input', { type: 'checkbox', name: 'setuju_privasi', required: true }),
      h(
        'span',
        null,
        `Saya menyetujui pemrosesan data pribadi di atas oleh ${situsData.pengaturan.nama_instansi} untuk verifikasi peserta, pencatatan hasil belajar, dan penerbitan sertifikat, sesuai `,
        h('a', { href: '/privasi/', target: '_blank' }, 'kebijakan privasi'),
        '.',
      ),
    ),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h(
        'button',
        { class: 'tombol tombol--primer', type: 'submit' },
        ps ? 'Simpan perubahan' : 'Daftar sebagai peserta',
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
      try {
        await kirim('POST', '/lms/saya/profil', {
          nama: String(d.get('nama')),
          nip: String(d.get('nip')).replace(/\s/g, ''),
          instansi: String(d.get('instansi')),
          jabatan: String(d.get('jabatan')),
          setuju_privasi: d.get('setuju_privasi') === 'on',
        });
        await saya(true);
        toast('Profil tersimpan.', 'berhasil');
        location.hash = lanjutSetelahMasuk();
        if (location.hash === '#/') void rute();
      } catch (err) {
        tampilkanGalatForm(form, err);
      }
    });
  });
  const [label, warna] = ps
    ? (STATUS[ps.status] ?? [ps.status, 'biru'])
    : ['Belum terdaftar', 'biru'];
  isi(
    app,
    h(
      'div',
      { class: 'halaman__judul' },
      h('h1', null, 'Akun peserta'),
      h('p', null, `Masuk sebagai ${r.akun.email}`),
    ),
    h(
      'section',
      { class: 'panel', style: { maxWidth: '760px' } },
      h('p', null, 'Status: ', lencanaStatus(label, warna as 'biru')),
      ps?.catatan
        ? h('p', { class: 'pesan pesan--peringatan' }, `Catatan pengelola: ${ps.catatan}`)
        : null,
      form,
    ),
    h(
      'div',
      { class: 'baris-tombol jarak-atas' },
      h('a', { class: 'tombol', href: '#/' }, 'Ke Ruang Belajar'),
      h(
        'button',
        { class: 'tombol tombol--polos', type: 'button', onclick: () => void keluar() },
        'Keluar',
      ),
    ),
  );
}

/* ---------------------------- Sertifikat ---------------------------- */

function qrSvg(teks: string): SVGSVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(teks);
  qr.make();
  const n = qr.getModuleCount();
  const svg = h('svg', {
    viewBox: `-2 -2 ${n + 4} ${n + 4}`,
    role: 'img',
    'aria-label': 'Kode QR verifikasi sertifikat',
    'shape-rendering': 'crispEdges',
  }) as SVGSVGElement;
  svg.appendChild(h('rect', { x: -2, y: -2, width: n + 4, height: n + 4, fill: '#fff' }));
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  svg.appendChild(h('path', { d, fill: '#231f20' }));
  return svg;
}

async function halamanSertifikat(kode: string): Promise<void> {
  isi(app, kerangka(6));
  const { sertifikat: s } = await get<{
    sertifikat: {
      nomor: string;
      kode_verifikasi: string;
      nama_peserta: string;
      nip_samaran: string;
      instansi: string;
      judul_kursus: string;
      nilai: number;
      terbit_at: string;
      penandatangan_nama: string;
      penandatangan_jabatan: string;
      penandatangan_nip: string | null;
      status: string;
      dicabut_alasan: string | null;
    };
  }>(`/lms/saya/sertifikat/${encodeURIComponent(kode)}`);
  const situsData = await situs();
  judulHalaman(`Sertifikat ${s.nomor}`);
  const url = `${location.origin}/sertifikat/?kode=${s.kode_verifikasi}`;
  isi(
    app,
    h(
      'div',
      { class: 'baris-tombol tanpa-cetak', style: { marginBottom: 'var(--s-4)' } },
      h(
        'button',
        { class: 'tombol tombol--primer', type: 'button', onclick: () => window.print() },
        ikon(IKON.cetak),
        'Cetak atau simpan PDF',
      ),
      h('a', { class: 'tombol', href: url, target: '_blank' }, 'Halaman verifikasi'),
    ),
    s.status !== 'sah'
      ? h(
          'p',
          { class: 'pesan pesan--galat' },
          `Sertifikat ini telah dicabut. Alasan: ${s.dicabut_alasan ?? '-'}`,
        )
      : null,
    h(
      'article',
      { class: 'sertifikat', 'aria-label': 'Sertifikat' },
      h(
        'header',
        null,
        h('p', null, situsData.pengaturan.nama_instansi),
        h('h1', null, 'SERTIFIKAT'),
        h('p', null, `Nomor ${s.nomor}`),
      ),
      h(
        'div',
        null,
        h('p', null, 'diberikan kepada'),
        h('p', { class: 'sertifikat__nama' }, s.nama_peserta),
        h('p', null, `NIP ${s.nip_samaran}, ${s.instansi}`),
        h('p', null, 'yang telah menyelesaikan program'),
        h('p', null, h('strong', null, s.judul_kursus)),
        h('p', null, `dengan nilai ujian akhir ${formatAngka(s.nilai, 2)}.`),
      ),
      h(
        'footer',
        { class: 'sertifikat__kaki' },
        h(
          'div',
          { class: 'sertifikat__qr' },
          qrSvg(url),
          h(
            'div',
            null,
            h('p', { style: { margin: '0' } }, 'Kode verifikasi'),
            h(
              'p',
              {
                style: {
                  margin: '0',
                  fontWeight: '700',
                  fontSize: '1.3em',
                  letterSpacing: '0.08em',
                },
              },
              s.kode_verifikasi,
            ),
            h('p', { style: { margin: '0' } }, location.host + '/sertifikat/'),
          ),
        ),
        h(
          'div',
          { class: 'sertifikat__ttd' },
          h('p', null, `Pesisir Barat, ${formatTanggal(s.terbit_at)}`),
          h('p', null, s.penandatangan_jabatan),
          h('p', { class: 'garis' }, s.penandatangan_nama),
          s.penandatangan_nip ? h('p', null, `NIP ${s.penandatangan_nip}`) : null,
        ),
      ),
    ),
  );
}

void rute();
