/**
 * Pembaca berkas dBase (.dbf) sederhana untuk data Podes BPS, tanpa dependensi.
 * Mendukung tipe kolom C (teks), N/F (angka), L (logika), dan D (tanggal sebagai teks).
 */
import { readFileSync } from 'node:fs';

/**
 * @param {string} path
 * @param {{ encoding?: BufferEncoding }} [opsi]
 * @returns {{ kolom: { nama: string, tipe: string, panjang: number }[], baris: Record<string, string | number | null>[] }}
 */
export function bacaDbf(path, { encoding = 'latin1' } = {}) {
  const b = readFileSync(path);
  if (b.length < 32) throw new Error(`${path}: bukan berkas DBF`);
  const jumlah = b.readUInt32LE(4);
  const panjangKepala = b.readUInt16LE(8);
  const panjangBaris = b.readUInt16LE(10);
  const kolom = [];
  for (let o = 32; o + 32 <= panjangKepala && b[o] !== 0x0d; o += 32) {
    const nama = b
      .toString('latin1', o, o + 11)
      .replace(/\0.*$/s, '')
      .trim()
      .toUpperCase();
    kolom.push({ nama, tipe: String.fromCharCode(b[o + 11]), panjang: b[o + 16] });
  }
  if (!kolom.length) throw new Error(`${path}: tidak ada definisi kolom`);
  const baris = [];
  for (let i = 0; i < jumlah; i++) {
    let o = panjangKepala + i * panjangBaris;
    if (o + panjangBaris > b.length) break;
    if (b[o] === 0x2a) continue; // baris terhapus
    o += 1;
    const r = {};
    for (const k of kolom) {
      const teks = b.toString(encoding, o, o + k.panjang).trim();
      o += k.panjang;
      if (k.tipe === 'N' || k.tipe === 'F') {
        const x = teks === '' ? null : Number(teks);
        r[k.nama] = x === null || Number.isFinite(x) ? x : null;
      } else if (k.tipe === 'L') r[k.nama] = /^[YyTt]$/.test(teks) ? 1 : 0;
      else r[k.nama] = teks;
    }
    baris.push(r);
  }
  return { kolom, baris };
}
