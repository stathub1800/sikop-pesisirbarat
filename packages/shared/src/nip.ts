/**
 * Validasi dan penyamaran NIP ASN (18 digit).
 * Struktur NIP: YYYYMMDD (lahir) + YYYYMM (TMT CPNS) + J (jenis kelamin 1/2) + NNN (urut).
 * Validasi struktur ini menolak NIP asal-asalan (temuan S06), tetapi BUKAN verifikasi
 * kepemilikan; verifikasi tetap dilakukan admin (status peserta "terverifikasi").
 */
export interface HasilNip {
  valid: boolean;
  pesan?: string;
}

const tanggalValid = (y: number, m: number, d: number): boolean => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export function validasiNip(raw: string, tahunSekarang = new Date().getUTCFullYear()): HasilNip {
  const nip = raw.replace(/\s/g, '');
  if (!/^\d{18}$/.test(nip)) return { valid: false, pesan: 'NIP harus 18 digit angka.' };
  const yLahir = Number(nip.slice(0, 4));
  const mLahir = Number(nip.slice(4, 6));
  const dLahir = Number(nip.slice(6, 8));
  const yTmt = Number(nip.slice(8, 12));
  const mTmt = Number(nip.slice(12, 14));
  const jk = nip[14];
  if (!tanggalValid(yLahir, mLahir, dLahir) || yLahir < 1940 || yLahir > tahunSekarang - 17)
    return { valid: false, pesan: 'Delapan digit pertama NIP bukan tanggal lahir yang wajar.' };
  if (yTmt < yLahir + 17 || yTmt > tahunSekarang || mTmt < 1 || mTmt > 12)
    return { valid: false, pesan: 'Digit 9 sampai 14 NIP bukan bulan dan tahun TMT yang wajar.' };
  if (jk !== '1' && jk !== '2') return { valid: false, pesan: 'Digit ke-15 NIP harus 1 atau 2.' };
  return { valid: true };
}

/** "198501012010011001" menjadi "19850101********01": cukup untuk dikenali, tidak untuk disalahgunakan. */
export const samarkanNip = (nip: string): string =>
  nip.length === 18 ? `${nip.slice(0, 8)}${'*'.repeat(8)}${nip.slice(16)}` : '*'.repeat(nip.length);
