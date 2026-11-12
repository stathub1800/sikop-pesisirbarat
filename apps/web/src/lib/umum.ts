/**
 * Inisialisasi bersama untuk setiap halaman publik: gaya, menu ponsel, data situs, status akun.
 */
import '../styles/tokens.css';
import '../styles/dasar.css';
import '../styles/komponen.css';
import { perbaruiTautanAkun } from './akun.ts';
import { terapkanSitus } from './situs.ts';

function menuPonsel(): void {
  const tombol = document.querySelector<HTMLButtonElement>('.kepala__menu');
  const nav = document.getElementById('nav-utama');
  if (!tombol || !nav) return;
  const atur = (buka: boolean): void => {
    tombol.setAttribute('aria-expanded', String(buka));
    nav.toggleAttribute('data-terbuka', buka);
  };
  tombol.addEventListener('click', () => atur(tombol.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tombol.getAttribute('aria-expanded') === 'true') {
      atur(false);
      tombol.focus();
    }
  });
}

/* ------------------------------ Tema tampilan ------------------------------ */

type Tema = 'sistem' | 'terang' | 'gelap';
const KUNCI_TEMA = 'sikop-tema';
const LABEL_TEMA: Record<Tema, string> = { sistem: 'sistem', terang: 'terang', gelap: 'gelap' };
const URUT_TEMA: Tema[] = ['sistem', 'terang', 'gelap'];

/** localStorage dapat melempar galat (mode privat, kebijakan peramban); tema bawaan tetap jalan. */
function bacaTema(): Tema {
  try {
    const t = localStorage.getItem(KUNCI_TEMA);
    return t === 'terang' || t === 'gelap' ? t : 'sistem';
  } catch {
    return 'sistem';
  }
}
let temaKini: Tema = bacaTema();
export function terapkanTema(t: Tema = temaKini): void {
  temaKini = t;
  if (t === 'sistem') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
  const tombol = document.getElementById('tombol-tema');
  if (!tombol) return;
  tombol.setAttribute('aria-label', `Tema tampilan: ${LABEL_TEMA[t]}. Klik untuk mengganti.`);
  const teks = tombol.querySelector('.tombol-tema__teks');
  if (teks) teks.textContent = `Tema: ${LABEL_TEMA[t]}`;
}
function pasangTombolTema(): void {
  terapkanTema();
  document.getElementById('tombol-tema')?.addEventListener('click', () => {
    const t = URUT_TEMA[(URUT_TEMA.indexOf(temaKini) + 1) % URUT_TEMA.length]!;
    try {
      if (t === 'sistem') localStorage.removeItem(KUNCI_TEMA);
      else localStorage.setItem(KUNCI_TEMA, t);
    } catch {
      /* tidak dapat disimpan: tema tetap berlaku untuk halaman ini saja */
    }
    terapkanTema(t);
    document.dispatchEvent(new CustomEvent('sikop:tema', { detail: t }));
  });
}
// Diterapkan secepatnya agar tidak berkedip dari tema sistem ke tema pilihan.
terapkanTema();

export function mulaiHalaman(): void {
  pasangTombolTema();
  menuPonsel();
  void terapkanSitus();
  void perbaruiTautanAkun();
}

/** Membaca parameter URL dengan aman. */
export const param = (k: string): string => new URLSearchParams(location.search).get(k) ?? '';
