/** Utilitas kriptografi berbasis Web Crypto (tersedia di Workers tanpa dependensi). */

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(teks: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks)));
}

/** Token acak 256 bit, base64url. Dipakai sebagai token sesi. */
export function tokenAcak(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Kode acak dari alfabet tertentu tanpa bias modulo (rejection sampling). */
export function kodeAcak(panjang: number, alfabet: string): string {
  const batas = 256 - (256 % alfabet.length);
  let out = '';
  while (out.length < panjang) {
    for (const b of crypto.getRandomValues(new Uint8Array(panjang * 2))) {
      if (b < batas) out += alfabet[b % alfabet.length];
      if (out.length === panjang) break;
    }
  }
  return out;
}

/** Fisher-Yates dengan sumber acak kriptografis. Mengembalikan salinan. */
export function acak<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const r = crypto.getRandomValues(new Uint32Array(1))[0] as number;
    const j = r % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Hash IP bergaram untuk audit: cukup untuk menelusuri pola, tanpa menyimpan IP mentah (UU PDP). */
export async function hashIp(
  ip: string | undefined,
  garam: string | undefined,
): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(`${garam ?? 'sikop'}:${ip}`)).slice(0, 16);
}
