/**
 * Perangkat kecil panel admin: field form, pembaca form bertipe, tabel, paginasi.
 * Tujuannya agar setiap layar admin cukup mendeskripsikan isian, bukan menulis DOM berulang.
 */
import { formatAngka } from '@sikop/shared';
import { h } from '../lib/dom.ts';

type Nilai = string | number | boolean | null | undefined;

interface OpsiField {
  bantu?: string;
  wajib?: boolean;
  min?: number;
  max?: number;
  langkah?: string;
  maks?: number;
  baca?: boolean;
}

const bungkus = (id: string, label: string, input: HTMLElement, o: OpsiField): HTMLElement =>
  h(
    'div',
    { class: 'isian' },
    h('label', { for: id }, label),
    input,
    o.bantu ? h('span', { class: 'isian__bantu' }, o.bantu) : null,
  );

let urut = 0;
const idBaru = (nama: string): string => `f-${nama.replace(/\W/g, '-')}-${++urut}`;

export function teks(nama: string, label: string, nilai: Nilai, o: OpsiField = {}): HTMLElement {
  const id = idBaru(nama);
  return bungkus(
    id,
    label,
    h('input', {
      id,
      name: nama,
      type: 'text',
      value: nilai ?? '',
      required: o.wajib,
      maxlength: o.maks,
      readonly: o.baca,
      'data-tipe': 'teks',
    }),
    o,
  );
}

export function angka(nama: string, label: string, nilai: Nilai, o: OpsiField = {}): HTMLElement {
  const id = idBaru(nama);
  return bungkus(
    id,
    label,
    h('input', {
      id,
      name: nama,
      type: 'number',
      value: nilai ?? '',
      required: o.wajib,
      min: o.min,
      max: o.max,
      step: o.langkah ?? '1',
      inputmode: 'decimal',
      'data-tipe': 'angka',
    }),
    o,
  );
}

export function area(nama: string, label: string, nilai: Nilai, o: OpsiField = {}): HTMLElement {
  const id = idBaru(nama);
  const t = h('textarea', {
    id,
    name: nama,
    required: o.wajib,
    maxlength: o.maks,
    'data-tipe': 'teks',
  });
  t.value = String(nilai ?? '');
  return bungkus(id, label, t, o);
}

export function pilihan(
  nama: string,
  label: string,
  opsi: readonly (string | [string, string])[],
  nilai: Nilai,
  o: OpsiField & { tipe?: 'teks' | 'angka' } = {},
): HTMLElement {
  const id = idBaru(nama);
  const sel = h(
    'select',
    { id, name: nama, required: o.wajib, 'data-tipe': o.tipe ?? 'teks' },
    opsi.map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return h('option', { value: v, selected: String(nilai ?? '') === v }, l);
    }),
  );
  return bungkus(id, label, sel, o);
}

export function centang(nama: string, label: string, nilai: boolean): HTMLElement {
  return h(
    'label',
    { class: 'centang' },
    h('input', { type: 'checkbox', name: nama, checked: nilai, 'data-tipe': 'boolean' }),
    h('span', null, label),
  );
}

/**
 * Membaca form menjadi objek bertipe berdasarkan data-tipe: angka kosong menjadi null,
 * centang menjadi boolean, teks kosong menjadi null bila diminta.
 */
export function bacaForm(form: HTMLFormElement, teksKosongNull = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const el of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('[name][data-tipe]')) {
    const tipe = el.dataset.tipe;
    if (tipe === 'boolean') out[el.name] = (el as HTMLInputElement).checked;
    else if (tipe === 'angka') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = teksKosongNull && el.value.trim() === '' ? null : el.value;
  }
  return out;
}

export interface Kolom<T> {
  judul: string;
  isi: (r: T) => Node | string | number | null;
  kanan?: boolean;
  hp?: boolean;
}

export function tabel<T>(kolom: Kolom<T>[], baris: T[], judul: string): HTMLElement {
  return h(
    'div',
    { class: 'tabel-wadah' },
    h(
      'table',
      null,
      h('caption', { class: 'sr' }, judul),
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          kolom.map((k) =>
            h(
              'th',
              {
                scope: 'col',
                class: [k.kanan ? 'kanan' : '', k.hp ? 'sembunyi-hp' : ''].join(' ').trim() || null,
              },
              k.judul,
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        baris.map((r) =>
          h(
            'tr',
            null,
            kolom.map((k) => {
              const v = k.isi(r);
              return h(
                'td',
                {
                  class:
                    [k.kanan ? 'kanan angka' : '', k.hp ? 'sembunyi-hp' : ''].join(' ').trim() ||
                    null,
                },
                typeof v === 'number' ? formatAngka(v) : v,
              );
            }),
          ),
        ),
      ),
    ),
  );
}

export function paginasi(
  total: number,
  halaman: number,
  ukuran: number,
  ke: (n: number) => void,
): HTMLElement {
  const jumlah = Math.max(1, Math.ceil(total / ukuran));
  return h(
    'nav',
    { class: 'paginasi', 'aria-label': 'Halaman' },
    h('span', null, `${formatAngka(total)} data, halaman ${halaman} dari ${jumlah}`),
    h(
      'div',
      { class: 'baris-tombol' },
      h(
        'button',
        {
          class: 'tombol tombol--kecil',
          type: 'button',
          disabled: halaman <= 1,
          onclick: () => ke(halaman - 1),
        },
        'Sebelumnya',
      ),
      h(
        'button',
        {
          class: 'tombol tombol--kecil',
          type: 'button',
          disabled: halaman >= jumlah,
          onclick: () => ke(halaman + 1),
        },
        'Berikutnya',
      ),
    ),
  );
}

/** Parameter hash: "#/sekolah?halaman=2&q=x" → { halaman: '2', q: 'x' }. */
export const paramHash = (): URLSearchParams =>
  new URLSearchParams(location.hash.split('?')[1] ?? '');

export function aturParamHash(p: Record<string, string | number | undefined>): void {
  const dasar = location.hash.split('?')[0];
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p))
    if (v !== undefined && v !== '' && v !== 1) u.set(k, String(v));
  const s = u.toString();
  location.hash = `${dasar}${s ? `?${s}` : ''}`;
}
