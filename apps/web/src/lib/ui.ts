/**
 * Komponen UI kecil: keadaan memuat/kosong/galat, toast, dialog konfirmasi, galat form.
 * Setiap tampilan data wajib punya empat keadaan (Bagian 8.2 standar).
 */
import { ApiError } from './api.ts';
import { h, isi } from './dom.ts';

export function kerangka(baris = 4): HTMLElement {
  return h(
    'div',
    { 'aria-busy': 'true', 'aria-label': 'Memuat data' },
    Array.from({ length: baris }, (_, i) =>
      h('div', {
        class: 'kerangka',
        style: { height: '18px', margin: '0 0 12px', width: `${92 - i * 9}%` },
      }),
    ),
  );
}

export function kosong(judul: string, teks: string, aksi?: Node): HTMLElement {
  return h('div', { class: 'keadaan' }, h('h3', null, judul), h('p', null, teks), aksi ?? null);
}

export function galat(e: unknown, ulangi?: () => void): HTMLElement {
  const pesan =
    e instanceof ApiError ? e.message : 'Terjadi kendala tak terduga. Muat ulang halaman.';
  return h(
    'div',
    { class: 'keadaan keadaan--galat', role: 'alert' },
    h('h3', null, 'Data belum dapat dimuat'),
    h('p', null, pesan),
    ulangi ? h('button', { class: 'tombol', type: 'button', onclick: ulangi }, 'Coba lagi') : null,
  );
}

/** Memuat data ke dalam wadah dengan keadaan memuat → berhasil / galat (dengan tombol coba lagi). */
export async function muat<T>(
  wadah: Element,
  ambil: () => Promise<T>,
  tampil: (data: T) => Node | Node[],
  barisKerangka = 4,
): Promise<T | null> {
  isi(wadah, kerangka(barisKerangka));
  try {
    const data = await ambil();
    isi(wadah, tampil(data));
    return data;
  } catch (e) {
    isi(
      wadah,
      galat(e, () => void muat(wadah, ambil, tampil, barisKerangka)),
    );
    return null;
  }
}

let wadahToast: HTMLElement | null = null;
export function toast(
  pesan: string,
  jenis: 'info' | 'berhasil' | 'galat' = 'info',
  ms = 5000,
): void {
  if (!wadahToast) {
    wadahToast = h('div', { class: 'toast-wadah', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(wadahToast);
  }
  const el = h(
    'div',
    { class: `toast toast--${jenis}` },
    h('span', null, pesan),
    h('button', { type: 'button', onclick: () => el.remove() }, 'Tutup'),
  );
  wadahToast.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Dialog konfirmasi berbasis <dialog> (dapat diakses keyboard, fokus terkunci otomatis). */
export function konfirmasi(
  judul: string,
  teks: string,
  label = 'Lanjutkan',
  bahaya = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    const d = h(
      'dialog',
      { 'aria-labelledby': 'dlg-judul' },
      h('div', { class: 'dialog__isi' }, h('h2', { id: 'dlg-judul' }, judul), h('p', null, teks)),
      h(
        'div',
        { class: 'dialog__aksi' },
        h('button', { class: 'tombol', type: 'button', onclick: () => tutup(false) }, 'Batal'),
        h(
          'button',
          {
            class: `tombol ${bahaya ? 'tombol--bahaya' : 'tombol--primer'}`,
            type: 'button',
            onclick: () => tutup(true),
          },
          label,
        ),
      ),
    ) as HTMLDialogElement;
    const tutup = (v: boolean): void => {
      d.close();
      d.remove();
      resolve(v);
    };
    d.addEventListener('cancel', () => tutup(false));
    document.body.appendChild(d);
    d.showModal();
  });
}

/** Menandai kolom form yang galat berdasarkan rincian dari API, dan memfokuskan yang pertama. */
export function tampilkanGalatForm(form: HTMLFormElement, e: unknown): void {
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll('.isian__galat[data-otomatis]')) el.remove();
  if (!(e instanceof ApiError)) {
    toast('Terjadi kendala. Coba lagi.', 'galat');
    return;
  }
  let pertama: HTMLElement | null = null;
  for (const [nama, pesan] of Object.entries(e.rincian)) {
    const input = form.querySelector<HTMLElement>(`[name="${CSS.escape(nama)}"]`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const id = `galat-${nama}`;
    input.setAttribute('aria-describedby', id);
    input
      .closest('.isian, .centang')
      ?.appendChild(h('span', { class: 'isian__galat', id, 'data-otomatis': '' }, pesan.join(' ')));
    pertama ??= input;
  }
  pertama?.focus();
  toast(e.message, 'galat');
}

/** Tombol dengan keadaan sibuk selama aksi berjalan (mencegah klik ganda). */
export async function sibuk<T>(
  tombol: HTMLButtonElement,
  aksi: () => Promise<T>,
): Promise<T | undefined> {
  const label = tombol.textContent;
  tombol.disabled = true;
  tombol.setAttribute('aria-busy', 'true');
  tombol.textContent = 'Memproses…';
  try {
    return await aksi();
  } finally {
    tombol.disabled = false;
    tombol.removeAttribute('aria-busy');
    tombol.textContent = label;
  }
}

export const lencanaStatus = (
  teks: string,
  warna: 'biru' | 'hijau' | 'oranye' | 'merah' | 'kuning' | '' = '',
): HTMLElement => h('span', { class: `lencana${warna ? ` lencana--${warna}` : ''}` }, teks);
