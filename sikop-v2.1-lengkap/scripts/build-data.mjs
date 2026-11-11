#!/usr/bin/env node
/**
 * Pipeline data SIKOP (dijalankan lokal maupun di GitHub Actions).
 *
 * Masukan:
 *   data/raw/sekolah.csv                  ekspor data sekolah
 *   data/raw/batas-kecamatan/*.geojson    batas kecamatan per kode Kemendagri
 * Keluaran:
 *   apps/web/public/data/kecamatan.geojson   batas disederhanakan untuk peta (S05)
 *   build/seed.sql                           data kecamatan, sekolah, pengaturan awal, draf indikator lama
 *   build/laporan-mutu-data.md               rekonsiliasi dan daftar temuan untuk petugas
 *   build/temuan-data.csv                    temuan per baris (dapat difilter di Excel)
 *
 * Opsi:
 *   --boleh-galat   tidak gagal walau ada baris yang ditolak (default: gagal, exit 1)
 *
 * Mengapa skrip ini, bukan langsung di Worker: penyederhanaan geometri dan uji titik-dalam-poligon
 * adalah komputasi berat yang melampaui batas CPU 10 ms Workers gratis.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import {
  areaKm2,
  bboxOf,
  hitungIndikator,
  INDIKATOR_PODES,
  INDIKATOR_SEKOLAH,
  KECAMATAN,
  KODE_KABUPATEN,
  kecamatanByKemendagri,
  kecamatanByKode,
  normalisasiBarisSekolah,
  parseCsv,
  pointInArea,
  satuanPodes,
  toCsv,
} from '../packages/shared/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KODE_KAB_BPS = KODE_KABUPATEN;
const BOLEH_GALAT = process.argv.includes('--boleh-galat');
const OUT_BUILD = join(ROOT, 'build');
const OUT_WEB = join(ROOT, 'apps/web/public/data');
mkdirSync(OUT_BUILD, { recursive: true });
mkdirSync(OUT_WEB, { recursive: true });

/* ------------------------------------------------------------------ */
/* 1. Batas kecamatan                                                  */
/* ------------------------------------------------------------------ */
const dirBatas = join(ROOT, 'data/raw/batas-kecamatan');
const fitur = [];
for (const f of readdirSync(dirBatas)
  .filter((x) => x.endsWith('.geojson'))
  .sort()) {
  const feat = JSON.parse(readFileSync(join(dirBatas, f), 'utf8'));
  const kec = kecamatanByKemendagri(feat.properties.code);
  if (!kec) throw new Error(`Kode Kemendagri tidak dikenal di ${f}: ${feat.properties.code}`);
  if (kec.nama.toUpperCase() !== String(feat.properties.name).toUpperCase())
    throw new Error(`Nama tidak cocok di ${f}: ${feat.properties.name} vs ${kec.nama}`);
  fitur.push({
    type: 'Feature',
    properties: { kode: kec.kode, nama: kec.nama },
    geometry: feat.geometry,
  });
}
const hilang = KECAMATAN.filter((k) => !fitur.some((f) => f.properties.kode === k.kode));
if (hilang.length)
  throw new Error(`Batas tidak tersedia untuk: ${hilang.map((k) => k.nama).join(', ')}`);

const batasPenuh = { type: 'FeatureCollection', features: fitur };
const ukuranAsli = Buffer.byteLength(JSON.stringify(batasPenuh));

// Visvalingam berbobot, pertahankan bentuk kecil (pulau), presisi ~1 m.
const hasil = await mapshaper.applyCommands(
  '-i in.json -simplify weighted 12% keep-shapes -clean -o out.json format=geojson precision=0.00001',
  { 'in.json': JSON.stringify(batasPenuh) },
);
const batasRingan = JSON.parse(hasil['out.json']);
for (const f of batasRingan.features) {
  const kec = kecamatanByKode(f.properties.kode);
  f.properties = { kode: kec.kode, nama: kec.nama, urutan: kec.urutan };
}
batasRingan.features.sort((a, b) => a.properties.urutan - b.properties.urutan);
const teksRingan = JSON.stringify(batasRingan);
writeFileSync(join(OUT_WEB, 'kecamatan.geojson'), teksRingan);

// Satu titik label di bagian dalam tiap kecamatan (agar wilayah berpulau tidak berlabel ganda).
const hasilLabel = await mapshaper.applyCommands(
  '-i in.json -points inner -o out.json format=geojson precision=0.00001',
  { 'in.json': teksRingan },
);
writeFileSync(join(OUT_WEB, 'kecamatan-label.geojson'), hasilLabel['out.json']);

const infoKec = new Map(
  fitur.map((f) => [
    f.properties.kode,
    {
      luas: Math.round(areaKm2(f.geometry) * 100) / 100,
      bbox: bboxOf(f.geometry).map((v) => Math.round(v * 1e5) / 1e5),
      geom: f.geometry,
    },
  ]),
);

/* ------------------------------------------------------------------ */
/* 2. Data sekolah                                                     */
/* ------------------------------------------------------------------ */
const baris = parseCsv(readFileSync(join(ROOT, 'data/raw/sekolah.csv'), 'utf8'));
const sekolah = [];
const temuan = [];
const npsnTerlihat = new Set();
baris.forEach((row, i) => {
  const r = normalisasiBarisSekolah(row, i + 2);
  temuan.push(...r.temuan);
  if (!r.data) return;
  if (npsnTerlihat.has(r.data.npsn)) {
    temuan.push({
      npsn: r.data.npsn,
      baris: i + 2,
      tingkat: 'galat',
      kolom: 'npsn',
      pesan: 'NPSN ganda',
    });
    return;
  }
  npsnTerlihat.add(r.data.npsn);
  sekolah.push(r.data);
});

// Uji titik-dalam-poligon memakai batas resolusi penuh.
let pipCocok = 0;
for (const s of sekolah) {
  if (s.lat === null || s.lon === null) continue;
  const lokasi = KECAMATAN.find((k) => pointInArea(s.lat, s.lon, infoKec.get(k.kode).geom));
  if (lokasi?.kode === s.kode_kec) {
    pipCocok++;
    continue;
  }
  const namaTercatat = kecamatanByKode(s.kode_kec).nama;
  const pesan = lokasi
    ? `Titik berada di Kec. ${lokasi.nama}, padahal tercatat di Kec. ${namaTercatat}.`
    : `Titik berada di luar batas kecamatan mana pun (kemungkinan garis pantai atau koordinat kurang teliti).`;
  if (s.koordinat_status === 'valid') s.koordinat_status = 'beda_kecamatan';
  s.koordinat_catatan = [s.koordinat_catatan, pesan].filter(Boolean).join(' ');
  temuan.push({ npsn: s.npsn, baris: 0, tingkat: 'peringatan', kolom: 'latitude', pesan });
}

/* ------------------------------------------------------------------ */
/* 3. Rekonsiliasi                                                     */
/* ------------------------------------------------------------------ */
const jumlah = (key) => sekolah.reduce((a, s) => a + s[key], 0);
const jumlahSumber = (kolom) => baris.reduce((a, r) => a + (Number.parseInt(r[kolom], 10) || 0), 0);
const galat = temuan.filter((t) => t.tingkat === 'galat');
const rekon = [
  [
    'Baris di berkas sumber',
    baris.length,
    sekolah.length + new Set(galat.map((t) => t.baris)).size,
  ],
  ['Peserta didik', jumlahSumber('jml_peserta_didik'), jumlah('pd')],
  ['Guru', jumlahSumber('jml_guru_total'), jumlah('guru')],
  ['Rombongan belajar', jumlahSumber('jml_rombel'), jumlah('rombel')],
];
const kodeKec = KECAMATAN.map((k) => k.kode);
const indJumlah = hitungIndikator(INDIKATOR_SEKOLAH[0], sekolah, kodeKec);
const totalPerKec = Object.values(indJumlah.perKecamatan).reduce((a, b) => a + b, 0);
rekon.push(['Sekolah: total kecamatan = total kabupaten', indJumlah.kabupaten, totalPerKec]);

/* ------------------------------------------------------------------ */
/* 4. SQL seed                                                         */
/* ------------------------------------------------------------------ */
const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const sql = [
  '-- Dihasilkan otomatis oleh scripts/build-data.mjs. Jangan disunting manual.',
  `-- Waktu: ${new Date().toISOString()}`,
  'PRAGMA foreign_keys = ON;',
];

for (const k of KECAMATAN) {
  const i = infoKec.get(k.kode);
  sql.push(
    `INSERT INTO kecamatan (kode, kode_kemendagri, nama, urutan, luas_km2_peta, bbox_json) VALUES (${q(k.kode)}, ${q(k.kodeKemendagri)}, ${q(k.nama)}, ${k.urutan}, ${i.luas}, ${q(JSON.stringify(i.bbox))})` +
      ` ON CONFLICT(kode) DO UPDATE SET nama=excluded.nama, urutan=excluded.urutan, luas_km2_peta=excluded.luas_km2_peta, bbox_json=excluded.bbox_json;`,
  );
}

const KOLOM = [
  'npsn',
  'sekolah_id',
  'nama',
  'bentuk',
  'jenjang',
  'status',
  'akreditasi',
  'alamat',
  'dusun',
  'rt',
  'rw',
  'kode_pos',
  'kode_kec',
  'telepon',
  'email',
  'website',
  'yayasan',
  'lat',
  'lon',
  'koordinat_status',
  'koordinat_catatan',
  'waktu_penyelenggaraan',
  'kurikulum',
  'sumber_listrik',
  'daya_listrik',
  'akses_internet',
  'luas_tanah',
  'pd',
  'pd_l',
  'pd_p',
  'rombel',
  'guru',
  'guru_l',
  'guru_p',
  'rk_baik',
  'rk_rusak_ringan',
  'rk_rusak_sedang',
  'rk_rusak_berat',
];
const setUpdate = KOLOM.filter((c) => c !== 'npsn')
  .map((c) => `${c}=excluded.${c}`)
  .join(', ');
for (const s of sekolah) {
  // Upsert idempoten: impor ulang tidak menggandakan data; version naik agar edit admin yang
  // bersamaan terdeteksi sebagai konflik.
  sql.push(
    `INSERT INTO sekolah (${KOLOM.join(', ')}) VALUES (${KOLOM.map((c) => q(s[c])).join(', ')})` +
      ` ON CONFLICT(npsn) DO UPDATE SET ${setUpdate}, version=sekolah.version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by='pipeline';`,
  );
}

// Pengaturan awal. INSERT OR IGNORE: tidak menimpa isian admin pada impor ulang.
const pengaturan = {
  nama_singkat: 'SIKOP',
  kepanjangan: 'Sistem Informasi Kewilayahan dan Pembinaan Statistik',
  nama_instansi: 'BPS Kabupaten Pesisir Barat',
  alamat: '',
  pst_email: '',
  pst_whatsapp: '',
  pst_telepon: '',
  jam_layanan: 'Senin sampai Jumat, 08.00 sampai 15.30 WIB',
  sosmed_instagram: '',
  sosmed_youtube: '',
  sosmed_facebook: '',
  sosmed_x: '',
  situs_resmi: 'https://pesisirbaratkab.bps.go.id',
  mitra_json: '[]',
  tim_json: '[]',
  privasi_versi: '1.0',
  privasi_tanggal: '2026-11-09',
  sumber_data_sekolah: 'Data Pokok Pendidikan (Dapodik)',
  tanggal_data_sekolah: '2026-11-09',
  sumber_batas_wilayah:
    'Batas kecamatan indikatif, diolah dari data Badan Informasi Geospasial melalui repositori Alf-Anas/batas-administrasi-indonesia. Bukan rujukan batas resmi untuk keperluan hukum.',
  penandatangan_nama: '',
  penandatangan_jabatan: '',
  penandatangan_nip: '',
  sertifikat_aktif: '0',
};
for (const [k, v] of Object.entries(pengaturan)) {
  sql.push(`INSERT OR IGNORE INTO pengaturan (kunci, nilai) VALUES (${q(k)}, ${q(v)});`);
}

// Angka lama dari situs v1 dimasukkan sebagai DRAF (tidak tayang) sampai admin mengisi sumbernya (T03, T04, S03).
const lama = JSON.parse(readFileSync(join(ROOT, 'data/reference/indikator-lama.json'), 'utf8'));
for (const ind of lama.indikator) {
  sql.push(
    `INSERT OR IGNORE INTO indikator (id, nama, satuan, kategori, desimal, arah, agregasi, is_published, urutan, catatan_internal) VALUES (${q(ind.id)}, ${q(ind.nama)}, ${q(ind.satuan)}, ${q(ind.kategori)}, ${ind.desimal}, ${q(ind.arah)}, ${q(ind.agregasi)}, 0, ${ind.urutan}, ${q(lama.catatan)});`,
  );
  for (const [kode, nilai] of Object.entries(ind.nilai)) {
    sql.push(
      `INSERT OR IGNORE INTO indikator_nilai (indikator_id, kode_kec, nilai) VALUES (${q(ind.id)}, ${q(kode)}, ${q(nilai)});`,
    );
  }
}
// Potret Desa (Podes): hanya agregat kecamatan dari scripts/build-podes.mjs. Selalu ditimpa agar
// pembaruan data Podes langsung tayang; tahun terbaru yang dipakai.
const berkasPodes = readdirSync(join(ROOT, 'data/raw'))
  .filter((f) => /^podes-\d{4}-kecamatan\.csv$/.test(f))
  .sort();
const podesTerbaru = berkasPodes.at(-1);
if (podesTerbaru) {
  const baris = parseCsv(readFileSync(join(ROOT, 'data/raw', podesTerbaru), 'utf8'));
  const tahun = podesTerbaru.slice(6, 10);
  const angka = (v) => (v === '' || v === undefined ? null : Number(v));
  let jumlahPodes = 0;
  for (const [urut, ind] of INDIKATOR_PODES.entries()) {
    const milik = baris.filter((r) => r.indikator_id === ind.id);
    if (!milik.length) continue;
    jumlahPodes++;
    const kab = milik.find((r) => r.kode_wilayah === KODE_KAB_BPS);
    const metode = `${ind.definisi} Rujukan kuesioner Podes: ${ind.rujukan}. Ditampilkan sebagai agregat kecamatan.`;
    const kolom = {
      id: ind.id,
      nama: ind.nama,
      satuan: satuanPodes(ind),
      kategori: ind.tema,
      sumber: `Podes ${tahun} (Pemutakhiran Data Perkembangan Desa), BPS`,
      tahun,
      metode,
      desimal: 1,
      arah: ind.arah,
      agregasi: 'tidak_ada',
      kabupaten_nilai: angka(kab?.nilai),
      is_published: 1,
      urutan: 500 + urut,
      unit_penyebut: ind.jenis === 'persen' ? ind.unit : 'desa',
      rujukan: ind.rujukan,
      kabupaten_pembilang: angka(kab?.pembilang),
      kabupaten_penyebut: angka(kab?.penyebut),
      updated_by: 'pipeline-podes',
    };
    const nama = Object.keys(kolom);
    sql.push(
      `INSERT INTO indikator (${nama.join(', ')}) VALUES (${nama.map((k) => q(kolom[k])).join(', ')}) ON CONFLICT(id) DO UPDATE SET ${nama
        .filter((k) => k !== 'id')
        .map((k) => `${k} = excluded.${k}`)
        .join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`,
    );
    for (const r of milik.filter((x) => x.kode_wilayah !== KODE_KAB_BPS)) {
      if (!kecamatanByKode(r.kode_wilayah))
        throw new Error(`Podes: kode ${r.kode_wilayah} bukan kecamatan ${KODE_KAB_BPS}`);
      sql.push(
        `INSERT INTO indikator_nilai (indikator_id, kode_kec, nilai, pembilang, penyebut) VALUES (${q(ind.id)}, ${q(r.kode_wilayah)}, ${q(angka(r.nilai))}, ${q(angka(r.pembilang))}, ${q(angka(r.penyebut))}) ON CONFLICT(indikator_id, kode_kec) DO UPDATE SET nilai = excluded.nilai, pembilang = excluded.pembilang, penyebut = excluded.penyebut;`,
      );
    }
  }
  console.log(`Podes ${tahun}: ${jumlahPodes} indikator agregat kecamatan dimasukkan ke seed.`);
}

writeFileSync(join(OUT_BUILD, 'seed.sql'), sql.join('\n') + '\n');

/* ------------------------------------------------------------------ */
/* 5. Laporan mutu data                                                */
/* ------------------------------------------------------------------ */
const perStatus = sekolah.reduce(
  (m, s) => ((m[s.koordinat_status] = (m[s.koordinat_status] ?? 0) + 1), m),
  {},
);
const perKolom = temuan.reduce(
  (m, t) => ((m[`${t.tingkat}: ${t.kolom}`] = (m[`${t.tingkat}: ${t.kolom}`] ?? 0) + 1), m),
  {},
);
const md = [
  '# Laporan Mutu Data SIKOP',
  '',
  `Dibuat: ${new Date().toISOString()}`,
  '',
  '## Rekonsiliasi',
  '',
  '| Pemeriksaan | Sumber | Hasil | Status |',
  '|---|---:|---:|---|',
  ...rekon.map(([n, a, b]) => `| ${n} | ${a} | ${b} | ${a === b ? 'Cocok' : 'TIDAK COCOK'} |`),
  '',
  '## Batas wilayah',
  '',
  `- Kecamatan dengan batas: ${fitur.length} dari ${KECAMATAN.length}`,
  `- Ukuran berkas peta: ${(ukuranAsli / 1024).toFixed(0)} KB menjadi ${(Buffer.byteLength(teksRingan) / 1024).toFixed(0)} KB`,
  `- Luas total dari peta: ${[...infoKec.values()].reduce((a, i) => a + i.luas, 0).toFixed(1)} km²`,
  '',
  '## Status koordinat sekolah',
  '',
  '| Status | Jumlah |',
  '|---|---:|',
  ...Object.entries(perStatus).map(([k, v]) => `| ${k} | ${v} |`),
  `| Titik cocok dengan kecamatan tercatat | ${pipCocok} |`,
  '',
  '## Ringkasan temuan',
  '',
  '| Tingkat: kolom | Jumlah |',
  '|---|---:|',
  ...Object.entries(perKolom)
    .sort()
    .map(([k, v]) => `| ${k} | ${v} |`),
  '',
  'Rincian per baris ada di `temuan-data.csv`.',
];
writeFileSync(join(OUT_BUILD, 'laporan-mutu-data.md'), md.join('\n') + '\n');
writeFileSync(
  join(OUT_BUILD, 'temuan-data.csv'),
  '﻿' + toCsv(temuan, ['npsn', 'baris', 'tingkat', 'kolom', 'pesan']),
);

console.log(md.join('\n'));
const tidakCocok = rekon.filter(([, a, b]) => a !== b);
if (tidakCocok.length) {
  console.error(`\nREKONSILIASI GAGAL: ${tidakCocok.map(([n]) => n).join(', ')}`);
  if (!BOLEH_GALAT) process.exit(1);
}
if (galat.length && !BOLEH_GALAT) {
  console.error(
    `\n${galat.length} galat data. Perbaiki sumber atau jalankan dengan --boleh-galat.`,
  );
  process.exit(1);
}
