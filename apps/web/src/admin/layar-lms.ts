import {
  formatAngka,
  formatTanggal,
  JENIS_UJIAN,
  LABEL_UJIAN,
  STATUS_PESERTA,
} from '@sikop/shared';
import { get, kirim, qs } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import { konfirmasi, lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import {
  angka,
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
  is_published: number;
  version: number;
}
interface ModulRingkas {
  id: number;
  kursus_id: string;
  nomor: number;
  kode: string;
  judul: string;
  is_published: number;
}

const kirimForm = async (
  form: HTMLFormElement,
  aksi: () => Promise<unknown>,
  berhasil: string,
  ke?: string,
): Promise<void> => {
  await sibuk(form.querySelector('button[type=submit]') as HTMLButtonElement, async () => {
    try {
      await aksi();
      toast(berhasil, 'berhasil');
      if (ke) location.hash = ke;
    } catch (err) {
      tampilkanGalatForm(form, err);
    }
  });
};

/* ------------------------------ Kursus ------------------------------ */

export async function layarKursus(k: Konteks): Promise<void> {
  const r = await get<{ kursus: Kursus[]; modul: ModulRingkas[] }>('/admin/lms/kursus');
  isi(
    k.isi,
    h('h1', null, 'Kursus dan modul'),
    r.kursus.map((ku) => {
      const form = h(
        'form',
        { novalidate: true },
        h(
          'div',
          { class: 'grid-isian' },
          teks('kode', 'Kode', ku.kode, { wajib: true }),
          teks('judul', 'Judul', ku.judul, { wajib: true }),
          teks('subjudul', 'Subjudul', ku.subjudul),
          teks('kategori', 'Kategori', ku.kategori),
          teks('estimasi', 'Estimasi waktu', ku.estimasi),
          angka('nilai_lulus_akhir', 'Nilai lulus ujian akhir', ku.nilai_lulus_akhir, {
            min: 0,
            max: 100,
          }),
          angka('durasi_akhir_menit', 'Durasi ujian akhir (menit)', ku.durasi_akhir_menit, {
            min: 5,
            max: 240,
          }),
          angka('jumlah_soal_akhir', 'Jumlah soal ujian akhir', ku.jumlah_soal_akhir, {
            min: 5,
            max: 200,
            bantu: 'Diambil acak dari bank soal ujian akhir.',
          }),
        ),
        area('deskripsi', 'Deskripsi', ku.deskripsi, { wajib: true }),
        centang('is_published', 'Tayangkan kursus', Boolean(ku.is_published)),
        h(
          'div',
          { class: 'baris-tombol jarak-atas' },
          h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan kursus'),
        ),
      ) as HTMLFormElement;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void kirimForm(
          form,
          () =>
            kirim('PUT', `/admin/lms/kursus/${ku.id}`, { ...bacaForm(form), version: ku.version }),
          'Kursus tersimpan.',
        ).then(() => void layarKursus(k));
      });
      const modul = r.modul.filter((m) => m.kursus_id === ku.id);
      return [
        h('section', { class: 'panel' }, h('h2', null, ku.judul), form),
        h(
          'section',
          { class: 'panel' },
          h(
            'div',
            { class: 'panel__kepala' },
            h('h2', null, 'Modul'),
            h(
              'a',
              { class: 'tombol tombol--kecil', href: `#/modul/baru?kursus=${ku.id}` },
              'Tambah modul',
            ),
          ),
          tabel<ModulRingkas>(
            [
              { judul: 'No', isi: (m) => m.nomor },
              { judul: 'Judul', isi: (m) => h('a', { href: `#/modul/${m.id}` }, m.judul) },
              { judul: 'Kode', isi: (m) => m.kode, hp: true },
              {
                judul: 'Status',
                isi: (m) =>
                  m.is_published
                    ? lencanaStatus('Tayang', 'hijau')
                    : lencanaStatus('Draf', 'kuning'),
              },
              { judul: 'Soal', isi: (m) => h('a', { href: `#/soal?modul=${m.id}` }, 'Bank soal') },
            ],
            modul,
            'Daftar modul',
          ),
        ),
      ];
    }),
  );
}

/** Daftar baris berulang (video, kompetensi, sumber) yang dapat ditambah/dihapus. */
function daftarUlang(
  nama: string,
  judul: string,
  kolom: { kunci: string; label: string }[],
  data: Record<string, string>[],
): { el: HTMLElement; baca: () => Record<string, string>[] } {
  const wadah = h('div');
  const tambahBaris = (v: Record<string, string> = {}): void => {
    const baris = h(
      'fieldset',
      { class: 'daftar-ulang', 'data-daftar': nama },
      h(
        'div',
        { class: 'grid-isian' },
        kolom.map((c) => teks(`${nama}.${c.kunci}`, c.label, v[c.kunci] ?? '')),
      ),
      h(
        'button',
        {
          class: 'tombol tombol--kecil tombol--bahaya',
          type: 'button',
          onclick: () => baris.remove(),
        },
        'Hapus baris',
      ),
    );
    wadah.appendChild(baris);
  };
  data.forEach((d) => tambahBaris(d));
  const el = h(
    'section',
    { class: 'panel' },
    h('h2', null, judul),
    wadah,
    h(
      'button',
      { class: 'tombol tombol--kecil', type: 'button', onclick: () => tambahBaris() },
      'Tambah baris',
    ),
  );
  const baca = (): Record<string, string>[] =>
    [...wadah.querySelectorAll<HTMLElement>(`[data-daftar="${nama}"]`)]
      .map((f) =>
        Object.fromEntries(
          kolom.map((c) => [
            c.kunci,
            (f.querySelector<HTMLInputElement>(`[name="${nama}.${c.kunci}"]`)?.value ?? '').trim(),
          ]),
        ),
      )
      .filter((r) => Object.values(r).some(Boolean));
  return { el, baca };
}

export async function layarModulEdit(k: Konteks): Promise<void> {
  const id = k.arg[0] ?? 'baru';
  const baru = id === 'baru';
  const m = baru
    ? {
        kursus_id: paramHash().get('kursus') ?? 'pss-2026',
        nomor: 1,
        kode: '',
        judul: '',
        subjudul: '',
        deskripsi: '',
        kategori: '',
        estimasi: '',
        nilai_lulus: 75,
        ringkasan: '',
        video: [],
        kompetensi: [],
        sumber: [],
        is_published: 0,
        version: 0,
      }
    : (
        await get<{
          modul: Record<string, unknown> & {
            video: Record<string, string>[];
            kompetensi: Record<string, string>[];
            sumber: Record<string, string>[];
            version: number;
            kursus_id: string;
          };
        }>(`/admin/lms/modul/${id}`)
      ).modul;
  const video = daftarUlang(
    'video',
    'Video materi',
    [
      { kunci: 'judul', label: 'Judul video' },
      { kunci: 'url', label: 'URL embed YouTube' },
      { kunci: 'durasi', label: 'Durasi (mm:dd)' },
    ],
    m.video as Record<string, string>[],
  );
  const komp = daftarUlang(
    'kompetensi',
    'Kompetensi',
    [
      { kunci: 'judul', label: 'Judul' },
      { kunci: 'uraian', label: 'Uraian' },
    ],
    m.kompetensi as Record<string, string>[],
  );
  const sumber = daftarUlang(
    'sumber',
    'Bahan bacaan',
    [
      { kunci: 'judul', label: 'Judul' },
      { kunci: 'format', label: 'Format' },
      { kunci: 'url', label: 'URL (https)' },
      { kunci: 'penerbit', label: 'Penerbit' },
    ],
    m.sumber as Record<string, string>[],
  );
  const form = h(
    'form',
    { novalidate: true },
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'grid-isian' },
        angka('nomor', 'Nomor urut', m.nomor as number, { min: 1, max: 99 }),
        teks('kode', 'Kode', m.kode as string, {
          wajib: true,
          bantu: 'Huruf besar, angka, tanda hubung. Mis. PSS-MOD-05',
        }),
        teks('judul', 'Judul', m.judul as string, { wajib: true }),
        teks('subjudul', 'Subjudul', m.subjudul as string),
        teks('kategori', 'Kategori', m.kategori as string),
        teks('estimasi', 'Estimasi waktu', m.estimasi as string),
        angka('nilai_lulus', 'Nilai lulus post-test', m.nilai_lulus as number, {
          min: 0,
          max: 100,
        }),
      ),
      area('deskripsi', 'Deskripsi', m.deskripsi as string, { wajib: true }),
      area('ringkasan', 'Ringkasan materi', m.ringkasan as string),
    ),
    video.el,
    h(
      'p',
      { class: 'isian__bantu' },
      'Hanya URL embed YouTube yang diterima, mis. https://www.youtube.com/embed/ID_VIDEO. Jangan gunakan video contoh.',
    ),
    komp.el,
    sumber.el,
    h(
      'section',
      { class: 'panel' },
      centang('is_published', 'Tayangkan modul', Boolean(m.is_published)),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan modul'),
        h('a', { class: 'tombol', href: '#/kursus' }, 'Batal'),
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = bacaForm(form);
    const body = {
      kursus_id: m.kursus_id,
      nomor: d.nomor,
      kode: d.kode,
      judul: d.judul,
      subjudul: d.subjudul,
      deskripsi: d.deskripsi,
      kategori: d.kategori,
      estimasi: d.estimasi,
      nilai_lulus: d.nilai_lulus,
      ringkasan: d.ringkasan,
      is_published: d.is_published,
      video: video.baca(),
      kompetensi: komp.baca(),
      sumber: sumber.baca(),
      version: m.version,
    };
    void kirimForm(
      form,
      () =>
        baru
          ? kirim('POST', '/admin/lms/modul', body)
          : kirim('PUT', `/admin/lms/modul/${id}`, body),
      'Modul tersimpan.',
      '#/kursus',
    );
  });
  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah' },
      h('a', { href: '#/kursus' }, 'Kursus dan modul'),
      ` / ${baru ? 'Modul baru' : String(m.judul)}`,
    ),
    h('h1', null, baru ? 'Modul baru' : String(m.judul)),
    form,
  );
}

/* ------------------------------ Bank soal ------------------------------ */

interface Soal {
  id: number;
  kursus_id: string;
  modul_id: number | null;
  jenis: 'pre' | 'post' | 'akhir';
  urutan: number;
  pertanyaan: string;
  opsi: { id: string; text: string }[];
  kunci: string;
  pembahasan: string | null;
  is_active: number;
}

export async function layarSoal(k: Konteks): Promise<void> {
  const p = paramHash();
  const f = {
    kursus: p.get('kursus') ?? 'pss-2026',
    modul: p.get('modul') ?? '',
    jenis: p.get('jenis') ?? '',
  };
  const [r, ku] = await Promise.all([
    get<{ soal: Soal[]; sebaran_kunci: Record<string, number> }>(`/admin/lms/soal${qs(f)}`),
    get<{ kursus: Kursus[]; modul: ModulRingkas[] }>('/admin/lms/kursus'),
  ]);
  const form = h(
    'form',
    { class: 'saringan' },
    pilihan(
      'kursus',
      'Kursus',
      ku.kursus.map((x) => [x.id, x.judul] as [string, string]),
      f.kursus,
    ),
    pilihan(
      'modul',
      'Modul',
      [
        ['', 'Semua'],
        ...ku.modul
          .filter((m) => m.kursus_id === f.kursus)
          .map((m) => [String(m.id), `${m.nomor}. ${m.judul}`] as [string, string]),
      ],
      f.modul,
    ),
    pilihan(
      'jenis',
      'Jenis',
      [['', 'Semua'], ...JENIS_UJIAN.map((j) => [j, LABEL_UJIAN[j]] as [string, string])],
      f.jenis,
    ),
    h('button', { class: 'tombol', type: 'submit' }, 'Terapkan'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aturParamHash(bacaForm(form) as Record<string, string>);
  });
  const total = Object.values(r.sebaran_kunci).reduce((a, b) => a + b, 0);
  const maks = Math.max(0, ...Object.values(r.sebaran_kunci));
  isi(
    k.isi,
    h('h1', null, 'Bank soal'),
    h(
      'p',
      { class: 'pesan pesan--peringatan' },
      'Kunci jawaban hanya tampil di halaman ini dan tidak pernah dikirim ke peserta. Jangan membagikan tangkapan layar halaman ini.',
    ),
    form,
    total
      ? h(
          'p',
          { class: maks / total > 0.4 ? 'pesan' : 'isian__bantu' },
          `Sebaran kunci soal aktif: ${Object.entries(r.sebaran_kunci)
            .sort()
            .map(([kk, v]) => `${kk} ${v}`)
            .join(', ')}. `,
          maks / total > 0.4
            ? 'Kunci tidak seimbang. Urutan opsi sudah diacak per peserta sehingga aman, tetapi sebaiknya kunci di bank soal juga dibuat lebih merata.'
            : '',
        )
      : null,
    h(
      'div',
      { class: 'baris-tombol', style: { marginBottom: 'var(--s-4)' } },
      h(
        'a',
        {
          class: 'tombol tombol--primer',
          href: `#/soal/baru?kursus=${f.kursus}${f.modul ? `&modul=${f.modul}` : ''}`,
        },
        'Tambah soal',
      ),
    ),
    tabel<Soal>(
      [
        { judul: 'Jenis', isi: (s) => LABEL_UJIAN[s.jenis] },
        {
          judul: 'Pertanyaan',
          isi: (s) =>
            h(
              'a',
              { href: `#/soal/${s.id}?kursus=${s.kursus_id}` },
              s.pertanyaan.length > 120 ? `${s.pertanyaan.slice(0, 120)}…` : s.pertanyaan,
            ),
        },
        { judul: 'Kunci', isi: (s) => s.kunci },
        { judul: 'Aktif', isi: (s) => (s.is_active ? 'Ya' : 'Tidak'), hp: true },
      ],
      r.soal,
      'Daftar soal',
    ),
  );
}

export async function layarSoalEdit(k: Konteks): Promise<void> {
  const id = k.arg[0]!;
  const baru = id === 'baru';
  const p = paramHash();
  const kursus = p.get('kursus') ?? 'pss-2026';
  const [daftar, ku] = await Promise.all([
    get<{ soal: Soal[] }>(`/admin/lms/soal${qs({ kursus })}`),
    get<{ modul: ModulRingkas[] }>('/admin/lms/kursus'),
  ]);
  const s: Soal | undefined = baru ? undefined : daftar.soal.find((x) => x.id === Number(id));
  if (!baru && !s)
    return void isi(k.isi, h('p', { class: 'pesan pesan--galat' }, 'Soal tidak ditemukan.'));
  const opsi = (huruf: string): string => s?.opsi.find((o) => o.id === huruf)?.text ?? '';
  const form = h(
    'form',
    { novalidate: true },
    h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'grid-isian' },
        pilihan(
          'jenis',
          'Jenis',
          JENIS_UJIAN.map((j) => [j, LABEL_UJIAN[j]] as [string, string]),
          s?.jenis ?? 'post',
        ),
        pilihan(
          'modul_id',
          'Modul',
          [
            ['', 'Tidak terikat modul (ujian akhir)'],
            ...ku.modul
              .filter((m) => m.kursus_id === kursus)
              .map((m) => [String(m.id), `${m.nomor}. ${m.judul}`] as [string, string]),
          ],
          s?.modul_id ?? p.get('modul') ?? '',
          { tipe: 'angka' },
        ),
        angka('urutan', 'Urutan', s?.urutan ?? 0, { min: 0 }),
      ),
      area('pertanyaan', 'Pertanyaan', s?.pertanyaan, { wajib: true }),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Opsi jawaban'),
      h(
        'p',
        { class: 'isian__bantu' },
        'Minimal dua opsi. Opsi kosong diabaikan. Urutan opsi diacak untuk setiap peserta.',
      ),
      ['A', 'B', 'C', 'D', 'E'].map((x) => teks(`opsi.${x}`, `Opsi ${x}`, opsi(x))),
      pilihan('kunci', 'Kunci jawaban', ['A', 'B', 'C', 'D', 'E'], s?.kunci ?? 'A'),
      area('pembahasan', 'Pembahasan', s?.pembahasan, {
        bantu: 'Ditampilkan setelah peserta lulus post-test modul.',
      }),
    ),
    h(
      'section',
      { class: 'panel' },
      centang('is_active', 'Soal aktif', s ? Boolean(s.is_active) : true),
      h(
        'div',
        { class: 'baris-tombol jarak-atas' },
        h('button', { class: 'tombol tombol--primer', type: 'submit' }, 'Simpan soal'),
        h('a', { class: 'tombol', href: '#/soal' }, 'Batal'),
      ),
    ),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = bacaForm(form, true);
    const body = {
      kursus_id: kursus,
      modul_id: d.modul_id ?? null,
      jenis: d.jenis,
      urutan: d.urutan ?? 0,
      pertanyaan: d.pertanyaan ?? '',
      opsi: ['A', 'B', 'C', 'D', 'E']
        .map((x) => ({ id: x, text: String(d[`opsi.${x}`] ?? '').trim() }))
        .filter((o) => o.text),
      kunci: d.kunci,
      pembahasan: d.pembahasan,
      is_active: d.is_active,
    };
    void kirimForm(
      form,
      () =>
        baru ? kirim('POST', '/admin/lms/soal', body) : kirim('PUT', `/admin/lms/soal/${id}`, body),
      'Soal tersimpan.',
      `#/soal?kursus=${kursus}`,
    );
  });
  isi(
    k.isi,
    h(
      'nav',
      { class: 'remah' },
      h('a', { href: '#/soal' }, 'Bank soal'),
      ` / ${baru ? 'Soal baru' : `Soal ${id}`}`,
    ),
    h('h1', null, baru ? 'Soal baru' : `Soal ${id}`),
    form,
  );
}

/* -------------------------------- Peserta -------------------------------- */

interface Peserta {
  akun_id: string;
  nama: string;
  nip: string;
  instansi: string;
  jabatan: string;
  status: string;
  catatan: string | null;
  email: string;
  created_at: string;
  nilai_akhir: number | null;
  sertifikat: string | null;
}
const WARNA_PESERTA: Record<string, 'kuning' | 'hijau' | 'merah' | ''> = {
  menunggu: 'kuning',
  terverifikasi: 'hijau',
  ditolak: 'merah',
  nonaktif: '',
};

export async function layarPeserta(k: Konteks): Promise<void> {
  const p = paramHash();
  const f = {
    status: p.get('status') ?? '',
    q: p.get('q') ?? '',
    halaman: Number(p.get('halaman') ?? 1),
  };
  const r = await get<{ items: Peserta[]; total: number; halaman: number; ukuran: number }>(
    `/admin/lms/peserta${qs(f)}`,
  );
  const form = h(
    'form',
    { class: 'saringan' },
    pilihan(
      'status',
      'Status',
      [['', 'Semua'], ...STATUS_PESERTA.map((s) => [s, s] as [string, string])],
      f.status,
    ),
    teks('q', 'Nama, instansi, NIP, atau email', f.q),
    h('button', { class: 'tombol', type: 'submit' }, 'Terapkan'),
  ) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    aturParamHash({ ...(bacaForm(form) as Record<string, string>), halaman: 1 });
  });
  const ubah = async (ps: Peserta, status: string): Promise<void> => {
    let catatan: string | null = null;
    if (status === 'ditolak') {
      catatan = prompt(`Alasan penolakan untuk ${ps.nama} (tampil ke peserta):`) ?? null;
      if (!catatan) return;
    } else if (
      !(await konfirmasi(
        `Verifikasi ${ps.nama}?`,
        `Pastikan NIP ${ps.nip} dan instansi ${ps.instansi} sesuai data kepegawaian. Bila peserta sudah lulus ujian akhir, sertifikat langsung terbit.`,
        'Verifikasi',
      ))
    )
      return;
    try {
      const res = await kirim<{ sertifikat: { status: string }[] }>(
        'PUT',
        `/admin/lms/peserta/${ps.akun_id}`,
        { status, catatan },
      );
      const terbit = res.sertifikat.filter((s) => s.status === 'terbit').length;
      toast(
        `Status ${ps.nama} diperbarui.${terbit ? ` ${terbit} sertifikat terbit.` : ''}`,
        'berhasil',
      );
      void layarPeserta(k);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memperbarui.', 'galat');
    }
  };
  isi(
    k.isi,
    h('h1', null, 'Peserta'),
    h(
      'p',
      { class: 'isian__bantu' },
      'Verifikasi dilakukan dengan mencocokkan NIP, nama, dan instansi terhadap data kepegawaian. NIP utuh hanya tampil di halaman ini.',
    ),
    form,
    tabel<Peserta>(
      [
        {
          judul: 'Peserta',
          isi: (x) =>
            h('span', null, h('strong', null, x.nama), h('br'), h('small', null, x.email)),
        },
        { judul: 'NIP', isi: (x) => x.nip },
        { judul: 'Instansi', isi: (x) => `${x.instansi}, ${x.jabatan}`, hp: true },
        {
          judul: 'Ujian akhir',
          isi: (x) => (x.nilai_akhir === null ? '–' : formatAngka(x.nilai_akhir, 0)),
          kanan: true,
        },
        { judul: 'Status', isi: (x) => lencanaStatus(x.status, WARNA_PESERTA[x.status] ?? '') },
        {
          judul: 'Aksi',
          isi: (x) =>
            h(
              'div',
              { class: 'baris-tombol' },
              x.status !== 'terverifikasi'
                ? h(
                    'button',
                    {
                      class: 'tombol tombol--kecil tombol--primer',
                      type: 'button',
                      onclick: () => void ubah(x, 'terverifikasi'),
                    },
                    'Verifikasi',
                  )
                : null,
              x.status !== 'ditolak'
                ? h(
                    'button',
                    {
                      class: 'tombol tombol--kecil tombol--bahaya',
                      type: 'button',
                      onclick: () => void ubah(x, 'ditolak'),
                    },
                    'Tolak',
                  )
                : null,
            ),
        },
      ],
      r.items,
      'Daftar peserta',
    ),
    paginasi(r.total, r.halaman, r.ukuran, (n) => aturParamHash({ ...f, halaman: n })),
  );
}

/* ------------------------------- Sertifikat ------------------------------ */

interface Sert {
  nomor: string;
  kode_verifikasi: string;
  nama_peserta: string;
  instansi: string;
  nilai: number;
  terbit_at: string;
  status: string;
}

export async function layarSertifikat(k: Konteks): Promise<void> {
  const r = await get<{
    sertifikat: Sert[];
    tertunda: { akun_id: string; nama: string; instansi: string; status_peserta: string }[];
  }>('/admin/lms/sertifikat');
  const tombol = h(
    'button',
    { class: 'tombol tombol--primer', type: 'button', disabled: r.tertunda.length === 0 },
    'Terbitkan sertifikat tertunda',
  ) as HTMLButtonElement;
  tombol.addEventListener(
    'click',
    () =>
      void sibuk(tombol, async () => {
        const res = await kirim<{ hasil: Record<string, number> }>(
          'POST',
          '/admin/lms/sertifikat/terbitkan-tertunda',
        );
        const label: Record<string, string> = {
          terbit: 'terbit',
          menunggu_verifikasi: 'menunggu verifikasi peserta',
          ditangguhkan: 'ditangguhkan (pengaturan sertifikat belum lengkap)',
          sudah_ada: 'sudah ada',
        };
        toast(
          Object.entries(res.hasil)
            .map(([s, n]) => `${n} ${label[s] ?? s}`)
            .join(', ') || 'Tidak ada yang diproses.',
          'info',
          8000,
        );
        void layarSertifikat(k);
      }),
  );
  const cabut = async (s: Sert): Promise<void> => {
    const alasan = prompt(
      `Alasan mencabut sertifikat ${s.nomor} (minimal 10 karakter, tampil di halaman verifikasi):`,
    );
    if (!alasan) return;
    if (
      !(await konfirmasi(
        'Cabut sertifikat?',
        `Sertifikat ${s.nomor} atas nama ${s.nama_peserta} akan berstatus dicabut. Tindakan ini tercatat di jejak audit.`,
        'Cabut',
        true,
      ))
    )
      return;
    try {
      await kirim('POST', '/admin/lms/sertifikat/cabut', { nomor: s.nomor, alasan });
      toast('Sertifikat dicabut.', 'berhasil');
      void layarSertifikat(k);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mencabut.', 'galat');
    }
  };
  isi(
    k.isi,
    h('h1', null, 'Sertifikat'),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, `Tertunda (${r.tertunda.length})`),
      h(
        'p',
        { class: 'isian__bantu' },
        'Peserta yang sudah lulus ujian akhir tetapi sertifikatnya belum terbit, karena peserta belum diverifikasi atau pengaturan penandatangan belum lengkap.',
      ),
      r.tertunda.length
        ? h(
            'ul',
            null,
            r.tertunda.map((t) =>
              h('li', null, `${t.nama}, ${t.instansi} (peserta ${t.status_peserta})`),
            ),
          )
        : null,
      tombol,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Sertifikat terbit'),
      tabel<Sert>(
        [
          {
            judul: 'Nomor',
            isi: (s) =>
              h('a', { href: `/sertifikat/?kode=${s.kode_verifikasi}`, target: '_blank' }, s.nomor),
          },
          { judul: 'Peserta', isi: (s) => `${s.nama_peserta}, ${s.instansi}` },
          { judul: 'Nilai', isi: (s) => formatAngka(s.nilai, 0), kanan: true },
          { judul: 'Terbit', isi: (s) => formatTanggal(s.terbit_at), hp: true },
          {
            judul: 'Status',
            isi: (s) =>
              s.status === 'sah'
                ? lencanaStatus('Sah', 'hijau')
                : lencanaStatus('Dicabut', 'merah'),
          },
          {
            judul: 'Aksi',
            isi: (s) =>
              s.status === 'sah'
                ? h(
                    'button',
                    {
                      class: 'tombol tombol--kecil tombol--bahaya',
                      type: 'button',
                      onclick: () => void cabut(s),
                    },
                    'Cabut',
                  )
                : null,
          },
        ],
        r.sertifikat,
        'Daftar sertifikat',
      ),
    ),
  );
}
