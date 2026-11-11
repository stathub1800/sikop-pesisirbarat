/**
 * Membangun SQL seed ruang belajar dari bank (kursus, modul, bab, pelajaran, soal, soal latihan).
 * Dipakai oleh scripts/build-lms-seed.mjs. Murni: tidak membaca atau menulis berkas.
 *
 * Seed bersifat idempoten: INSERT OR IGNORE, sehingga suntingan admin di panel tidak tertimpa.
 * Bila bank tidak memuat `bab`, bab dan pelajaran dibentuk dari modul dengan pemetaan yang sama seperti
 * migrasi 0003 (satu modul = satu bab; video, ringkasan, dan sumber menjadi pelajaran).
 */
import {
  KursusInputSchema,
  ModulInputSchema,
  SoalInputSchema,
  JENIS_PELAJARAN,
  periksaIsiPelajaran,
} from '../../packages/shared/src/index.ts';

const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const b = (v) => (v ? 1 : 0);
const daftar = (...nilai) => nilai.map(q).join(', ');

/** Pemetaan modul lama ke bab dan pelajaran (cermin migrasi 0003). */
export function pemetaanDariModul(modul) {
  const bab = [];
  const pelajaran = [];
  for (const m of modul) {
    bab.push({ id: m.id, kursus_id: m.kursus_id, modul_id: m.id, urutan: m.nomor, judul: m.judul });
    (m.video ?? []).forEach((v, i) =>
      pelajaran.push({
        id: m.id * 100 + i + 1,
        bab_id: m.id,
        urutan: i + 1,
        judul: v.judul || 'Video materi',
        jenis: 'video',
        isi: { url: v.url, durasi: v.durasi || null },
        durasi_menit: v.durasi?.includes(':') ? Number.parseInt(v.durasi, 10) + 1 : 0,
        wajib: false,
      }),
    );
    if ((m.ringkasan ?? '').trim())
      pelajaran.push({
        id: m.id * 100 + 20,
        bab_id: m.id,
        urutan: 20,
        judul: 'Ringkasan materi',
        jenis: 'bacaan',
        isi: { markdown: m.ringkasan },
        durasi_menit: 3,
        wajib: false,
      });
    (m.sumber ?? []).forEach((s, i) => {
      const pdf = String(s.format ?? '').toUpperCase() === 'PDF';
      pelajaran.push({
        id: m.id * 100 + 30 + i,
        bab_id: m.id,
        urutan: 30 + i,
        judul: s.judul,
        jenis: pdf ? 'pdf' : 'bacaan',
        isi: pdf
          ? { url: s.url, penerbit: s.penerbit || null }
          : { markdown: `[${s.judul.replace(/\[/g, '(').replace(/\]/g, ')')}](${s.url})` },
        durasi_menit: 5,
        wajib: false,
      });
    });
  }
  return { bab, pelajaran };
}

export function bangunSeedLms(bank) {
  const sql = [
    '-- Dihasilkan oleh scripts/build-lms-seed.mjs. Bank soal berisi KUNCI JAWABAN: jangan di-commit bila asli.',
    'PRAGMA foreign_keys = ON;',
  ];
  const galat = [];

  for (const k of bank.kursus) {
    const v = KursusInputSchema.safeParse({ ...k, version: 1 });
    if (!v.success)
      galat.push(
        `kursus ${k.id}: ${v.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    sql.push(
      `INSERT OR IGNORE INTO kursus (id, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus_akhir, durasi_akhir_menit, jumlah_soal_akhir, level, sasaran_json, hasil_belajar_json, durasi_menit, gambar_url, is_published, urutan) VALUES (${daftar(
        k.id,
        k.kode,
        k.judul,
        k.subjudul,
        k.deskripsi,
        k.kategori,
        k.estimasi,
        k.nilai_lulus_akhir,
        k.durasi_akhir_menit,
        k.jumlah_soal_akhir,
        k.level ?? 'dasar',
        JSON.stringify(k.sasaran ?? []),
        JSON.stringify(k.hasil_belajar ?? []),
        k.durasi_menit ?? 0,
        k.gambar_url ?? null,
      )}, ${b(k.is_published)}, ${k.urutan ?? 1});`,
    );
  }

  for (const m of bank.modul) {
    const v = ModulInputSchema.safeParse({ ...m, version: 1 });
    if (!v.success)
      galat.push(
        `modul ${m.kode}: ${v.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    sql.push(
      `INSERT OR IGNORE INTO modul (id, kursus_id, nomor, kode, judul, subjudul, deskripsi, kategori, estimasi, nilai_lulus, ringkasan, video_json, kompetensi_json, sumber_json, is_published) VALUES (${daftar(
        m.id,
        m.kursus_id,
        m.nomor,
        m.kode,
        m.judul,
        m.subjudul,
        m.deskripsi,
        m.kategori,
        m.estimasi,
        m.nilai_lulus,
        m.ringkasan,
        JSON.stringify(m.video),
        JSON.stringify(m.kompetensi),
        JSON.stringify(m.sumber),
      )}, ${b(m.is_published)});`,
    );
  }

  const { bab, pelajaran } = bank.bab
    ? { bab: bank.bab, pelajaran: bank.pelajaran ?? [] }
    : pemetaanDariModul(bank.modul);
  const idBab = new Set();
  for (const x of bab) {
    if (idBab.has(x.id)) galat.push(`bab ${x.id}: id ganda`);
    idBab.add(x.id);
    sql.push(
      `INSERT OR IGNORE INTO bab (id, kursus_id, modul_id, urutan, judul) VALUES (${daftar(x.id, x.kursus_id, x.modul_id ?? null, x.urutan, x.judul)});`,
    );
  }
  const idPelajaran = new Set();
  const jenisPelajaran = new Map();
  for (const p of pelajaran) {
    if (idPelajaran.has(p.id)) galat.push(`pelajaran ${p.id}: id ganda`);
    idPelajaran.add(p.id);
    jenisPelajaran.set(p.id, p.jenis);
    if (!idBab.has(p.bab_id)) galat.push(`pelajaran ${p.id}: bab ${p.bab_id} tidak ada`);
    if (!JENIS_PELAJARAN.includes(p.jenis)) {
      galat.push(`pelajaran ${p.id}: jenis ${p.jenis} tidak dikenal`);
      continue;
    }
    const isi = periksaIsiPelajaran(p.jenis, p.isi);
    if (!isi.sukses) galat.push(`pelajaran ${p.id}: ${isi.pesan}`);
    sql.push(
      `INSERT OR IGNORE INTO pelajaran (id, bab_id, urutan, judul, jenis, isi_json, durasi_menit, wajib) VALUES (${daftar(
        p.id,
        p.bab_id,
        p.urutan,
        p.judul,
        p.jenis,
        JSON.stringify(isi.sukses ? isi.isi : p.isi),
        p.durasi_menit ?? 0,
      )}, ${b(p.wajib ?? true)});`,
    );
  }

  const idSoal = new Set();
  for (const s of bank.soal) {
    const v = SoalInputSchema.safeParse(s);
    if (!v.success) galat.push(`soal ${s.id}: ${v.error.issues.map((i) => i.message).join('; ')}`);
    if (idSoal.has(s.id)) galat.push(`soal ${s.id}: id ganda`);
    idSoal.add(s.id);
    sql.push(
      `INSERT OR IGNORE INTO soal (id, kursus_id, modul_id, jenis, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active) VALUES (${daftar(
        s.id,
        s.kursus_id,
        s.modul_id,
        s.jenis,
        s.urutan,
        s.pertanyaan,
        JSON.stringify(s.opsi),
        s.kunci,
        s.pembahasan ?? null,
      )}, ${b(s.is_active ?? true)});`,
    );
  }

  const idLatihan = new Set();
  for (const s of bank.soal_latihan ?? []) {
    if (idLatihan.has(s.id)) galat.push(`soal latihan ${s.id}: id ganda`);
    idLatihan.add(s.id);
    if (jenisPelajaran.get(s.pelajaran_id) !== 'latihan')
      galat.push(`soal latihan ${s.id}: pelajaran ${s.pelajaran_id} bukan latihan`);
    const v = SoalInputSchema.safeParse({
      kursus_id: 'x',
      modul_id: 1,
      jenis: 'post',
      pertanyaan: s.pertanyaan,
      opsi: s.opsi,
      kunci: s.kunci,
      pembahasan: s.pembahasan,
      urutan: s.urutan ?? 0,
    });
    if (!v.success)
      galat.push(`soal latihan ${s.id}: ${v.error.issues.map((i) => i.message).join('; ')}`);
    sql.push(
      `INSERT OR IGNORE INTO soal_latihan (id, pelajaran_id, urutan, pertanyaan, opsi_json, kunci, pembahasan, is_active) VALUES (${daftar(
        s.id,
        s.pelajaran_id,
        s.urutan ?? 0,
        s.pertanyaan,
        JSON.stringify(s.opsi),
        s.kunci,
        s.pembahasan ?? null,
      )}, ${b(s.is_active ?? true)});`,
    );
  }

  const per = bank.soal.reduce((a, s) => ((a[s.jenis] = (a[s.jenis] ?? 0) + 1), a), {});
  return {
    sql: sql.join('\n') + '\n',
    galat,
    ringkasan: `${bank.kursus.length} kursus, ${bank.modul.length} modul, ${bab.length} bab, ${pelajaran.length} pelajaran, ${bank.soal.length} soal ${JSON.stringify(per)}, ${(bank.soal_latihan ?? []).length} soal latihan`,
  };
}
