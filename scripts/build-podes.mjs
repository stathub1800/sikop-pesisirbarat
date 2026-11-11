#!/usr/bin/env node
/**
 * Mengolah berkas DBF Podes menjadi agregat per kecamatan untuk SIKOP.
 *
 * KETENTUAN: data Podes hanya boleh ditampilkan sampai tingkat kecamatan. Berkas DBF berisi data
 * per desa, jadi disimpan di data/private/podes/ (diabaikan git) dan TIDAK PERNAH di-commit.
 * Hanya keluaran agregat (data/raw/podes-<tahun>-kecamatan.csv) yang boleh di-commit.
 *
 *   npm run data:podes                                    baca data/private/podes/, tahun 2026
 *   npm run data:podes -- --sumber "C:\Podes" --tahun 2026
 *
 * Masukan: berkas *desapart-1*.dbf dan *desapart-2*.dbf (keduanya berkolom IDDESA).
 * Setelahnya jalankan `npm run data:build` agar agregat masuk ke build/seed.sql.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agregatPodes,
  formatAngka,
  INDIKATOR_PODES,
  kecamatanByKode,
  satuanPodes,
  toCsv,
} from '../packages/shared/src/index.ts';
import { bacaDbf } from './lib/dbf.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nama, bawaan) => {
  const i = process.argv.indexOf(nama);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan;
};
const SUMBER = resolve(arg('--sumber', join(ROOT, 'data/private/podes')));
const TAHUN = arg('--tahun', '2026');
const KODE_KAB = arg('--kab', '1813');

if (!existsSync(SUMBER)) {
  console.error(`Folder sumber tidak ditemukan: ${SUMBER}
Letakkan berkas DBF Podes (desapart-1 dan desapart-2) di data/private/podes/ atau pakai --sumber.`);
  process.exit(1);
}
const berkas = readdirSync(SUMBER).filter((f) => /desapart-\d+.*\.dbf$/i.test(f));
if (!berkas.length) {
  console.error(`Tidak ada berkas *desapart-N*.dbf di ${SUMBER}.`);
  process.exit(1);
}

// Gabungkan semua bagian berdasarkan IDDESA.
const desa = new Map();
for (const f of berkas.sort()) {
  const { baris } = bacaDbf(join(SUMBER, f));
  for (const r of baris) {
    if (!r.IDDESA) continue;
    desa.set(r.IDDESA, { ...(desa.get(r.IDDESA) ?? {}), ...r });
  }
  console.log(`Dibaca ${f}: ${baris.length} baris`);
}

const hasil = agregatPodes([...desa.values()], KODE_KAB);

// Pengaman ketentuan: keluaran hanya boleh berisi kode kecamatan (7 digit) dan kabupaten.
for (const r of hasil) {
  const sah = r.kode_wilayah === KODE_KAB || kecamatanByKode(r.kode_wilayah) !== undefined;
  if (!sah) {
    console.error(
      `Kode wilayah ${r.kode_wilayah} bukan kecamatan ${KODE_KAB}; agregat dibatalkan.`,
    );
    process.exit(1);
  }
}

const keluar = join(ROOT, `data/raw/podes-${TAHUN}-kecamatan.csv`);
writeFileSync(
  keluar,
  toCsv(
    hasil.map((r) => ({ tahun: TAHUN, ...r })),
    ['tahun', 'indikator_id', 'kode_wilayah', 'pembilang', 'penyebut', 'nilai'],
  ),
);

const kab = hasil.filter((r) => r.kode_wilayah === KODE_KAB);
const jumlahDesa = [...desa.values()].filter((r) => String(r.IDDESA).startsWith(KODE_KAB)).length;
console.log(`\nAgregat Podes ${TAHUN}: ${jumlahDesa} desa, ${INDIKATOR_PODES.length} indikator.`);
for (const ind of INDIKATOR_PODES) {
  const r = kab.find((x) => x.indikator_id === ind.id);
  const rinci = ind.jenis === 'persen' ? ` (${r?.pembilang} dari ${r?.penyebut} ${ind.unit})` : '';
  console.log(`  ${ind.nama}: ${formatAngka(r?.nilai, 1)} ${satuanPodes(ind)}${rinci}`);
}
console.log(`\nDitulis: ${keluar}\nLangkah berikutnya: npm run data:build`);
