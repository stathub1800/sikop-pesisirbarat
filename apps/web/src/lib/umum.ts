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

export function mulaiHalaman(): void {
  menuPonsel();
  void terapkanSitus();
  void perbaruiTautanAkun();
}

/** Membaca parameter URL dengan aman. */
export const param = (k: string): string => new URLSearchParams(location.search).get(k) ?? '';
