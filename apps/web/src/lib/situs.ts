/**
 * Data situs dari /api/v1/situs: nama resmi, kontak PST, tautan media sosial.
 * Elemen kontak yang tidak diisi admin disembunyikan (R02: tidak ada lagi tautan "#").
 */
import { get } from './api.ts';

export interface Situs {
  pengaturan: Record<string, string>;
  sertifikat_aktif: boolean;
  google_client_id: string;
  turnstile_site_key: string;
  mode_dev: boolean;
  kecamatan: { kode: string; nama: string }[];
}

let janji: Promise<Situs> | null = null;
export const situs = (): Promise<Situs> => (janji ??= get<Situs>('/situs'));

const TAUTAN: Record<string, (v: string) => string> = {
  pst_email: (v) => `mailto:${v}`,
  pst_whatsapp: (v) => `https://wa.me/${v}`,
};

export async function terapkanSitus(): Promise<void> {
  let s: Situs;
  try {
    s = await situs();
  } catch {
    return; // Teks bawaan di HTML tetap tampil bila API tidak tersedia.
  }
  const p = s.pengaturan;
  for (const el of document.querySelectorAll<HTMLElement>('[data-situs]')) {
    const v = p[el.dataset.situs ?? ''];
    if (v) el.textContent = v;
    else if (el.hasAttribute('data-sembunyi-kosong')) el.hidden = true;
  }
  for (const li of document.querySelectorAll<HTMLElement>('[data-kontak]')) {
    const kunci = li.dataset.kontak ?? '';
    const v = p[kunci];
    const a = li.querySelector('a');
    if (!v || !a) continue;
    a.href = (TAUTAN[kunci] ?? ((x: string) => x))(v);
    if (a.href.startsWith('http')) a.target = '_blank';
    li.hidden = false;
  }
}
