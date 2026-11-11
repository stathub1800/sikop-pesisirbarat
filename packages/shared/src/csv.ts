/**
 * Pengurai dan penulis CSV sesuai RFC 4180 (kutip ganda, koma di dalam kutip, baris baru).
 * Ditulis sendiri agar dapat dipakai identik di browser, Worker, dan Node tanpa dependensi.
 */

/** Mengurai teks CSV menjadi array objek berdasarkan baris judul. BOM di awal diabaikan. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  const header = rows.shift();
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '')
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Mengurai CSV menjadi matriks string. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuote = /[",\r\n]/;

/**
 * Mengamankan sel dari CSV/Formula Injection: sel yang diawali = + - @ diberi apostrof
 * agar tidak dieksekusi sebagai rumus saat dibuka di Excel.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Menulis array objek menjadi CSV dengan urutan kolom yang ditentukan. */
export function toCsv<T extends object>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => escapeCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
