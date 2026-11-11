/**
 * Status masuk dan tombol "Masuk dengan Google" (Google Identity Services).
 * Token Google dikirim ke server untuk diverifikasi; browser tidak pernah menyimpan token sesi
 * (sesi berada di cookie HttpOnly).
 */
import type { Peran } from '@sikop/shared';
import { ApiError, get, kirim } from './api.ts';
import { h } from './dom.ts';
import { situs } from './situs.ts';
import { toast } from './ui.ts';

export interface Akun {
  id: string;
  email: string;
  nama: string;
  peran: Peran | null;
}
export interface Saya {
  akun: Akun | null;
  peserta: { nama: string; instansi: string; jabatan: string; status: string } | null;
}

let cache: Promise<Saya> | null = null;
export const saya = (segarkan = false): Promise<Saya> => {
  if (segarkan || !cache)
    cache = get<Saya>('/auth/saya').catch(() => ({ akun: null, peserta: null }));
  return cache;
};

export async function keluar(): Promise<void> {
  await kirim('POST', '/auth/keluar');
  cache = null;
  location.href = '/';
}

/** Memperbarui tautan "Masuk" di kepala halaman menjadi nama pengguna bila sudah masuk. */
export async function perbaruiTautanAkun(): Promise<void> {
  const link = document.querySelector<HTMLAnchorElement>('[data-akun-link]');
  if (!link) return;
  const s = await saya();
  if (!s.akun) return;
  link.textContent = s.akun.peran ? 'Panel admin' : 'Akun saya';
  link.href = s.akun.peran ? '/admin/' : '/belajar/#/akun';
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            ux_mode?: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function muatSkripGoogle(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Skrip Google gagal dimuat')));
    document.head.appendChild(s);
  });
}

/**
 * Menampilkan tombol masuk di dalam wadah. Bila client ID belum diatur, tampil penjelasan.
 * Pada mode pengembangan lokal, tersedia login pengembang.
 */
export async function tombolMasuk(
  wadah: HTMLElement,
  setelahMasuk: (a: Akun) => void,
): Promise<void> {
  const s = await situs();
  const selesai = async (credential: string): Promise<void> => {
    try {
      const r = await kirim<{ akun: Akun }>('POST', '/auth/google', { credential });
      cache = null;
      setelahMasuk(r.akun);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Proses masuk gagal.', 'galat');
    }
  };
  if (s.google_client_id) {
    const tempat = h('div', { class: 'tombol-google' });
    wadah.appendChild(tempat);
    try {
      await muatSkripGoogle();
      window.google!.accounts.id.initialize({
        client_id: s.google_client_id,
        callback: (r) => void selesai(r.credential),
        use_fedcm_for_prompt: true,
      });
      window.google!.accounts.id.renderButton(tempat, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'id',
        shape: 'pill',
      });
    } catch {
      tempat.textContent =
        'Tombol masuk Google tidak dapat dimuat. Periksa koneksi atau pemblokir skrip.';
    }
  } else if (!s.mode_dev) {
    wadah.appendChild(
      h(
        'p',
        { class: 'pesan pesan--peringatan' },
        'Fitur masuk belum diaktifkan oleh pengelola situs.',
      ),
    );
  }
  if (s.mode_dev) wadah.appendChild(formDev(setelahMasuk));
}

function formDev(setelahMasuk: (a: Akun) => void): HTMLElement {
  const email = h('input', {
    type: 'email',
    name: 'email',
    required: true,
    value: 'admin@contoh.go.id',
    autocomplete: 'off',
  });
  return h(
    'form',
    {
      class: 'pesan pesan--peringatan',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const r = await kirim<{ akun: Akun }>('POST', '/auth/dev', {
          email: email.value,
          nama: email.value.split('@')[0] ?? 'Pengembang',
        });
        cache = null;
        setelahMasuk(r.akun);
      },
    },
    h(
      'p',
      null,
      h('strong', null, 'Mode pengembangan. '),
      'Login tanpa Google, hanya tersedia di lingkungan lokal.',
    ),
    h(
      'div',
      { class: 'baris-tombol' },
      email,
      h('button', { class: 'tombol', type: 'submit' }, 'Masuk (pengembang)'),
    ),
  );
}
