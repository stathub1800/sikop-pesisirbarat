/**
 * Format tampilan baku Indonesia: angka 1.234.567, desimal koma (12,5), tanggal 5 November 2026.
 * Satu-satunya tempat format angka dibuat, agar tidak ada lagi campuran "32,4" dan "62.1" (temuan S07).
 */
const nf = new Map<number, Intl.NumberFormat>();

export function formatAngka(value: number | null | undefined, desimal = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  let f = nf.get(desimal);
  if (!f) {
    f = new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: desimal,
      maximumFractionDigits: desimal,
    });
    nf.set(desimal, f);
  }
  return f.format(value);
}

export const formatPersen = (value: number | null | undefined, desimal = 1): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '–'
    : `${formatAngka(value, desimal)}%`;

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/** "2026-11-05T..." menjadi "5 November 2026" (zona Asia/Jakarta). */
export function formatTanggal(iso: string | null | undefined, denganJam = false): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const wib = new Date(d.getTime() + 7 * 3600_000);
  const tgl = `${wib.getUTCDate()} ${BULAN[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
  if (!denganJam) return tgl;
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${tgl}, ${hh}.${mm} WIB`;
}

/** Huruf besar di awal kata: "SD NEGERI 1 KRUI" tetap, "kec. lemong" menjadi "Kec. Lemong". */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s.(/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}
