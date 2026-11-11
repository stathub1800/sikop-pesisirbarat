/**
 * Pembuat elemen DOM yang aman dari XSS.
 * Semua teks dimasukkan lewat textContent / createTextNode, sehingga data dari API atau pengguna
 * tidak pernah ditafsirkan sebagai HTML. innerHTML dilarang oleh aturan lint proyek.
 */
type Anak = Node | string | number | null | undefined | false | Anak[];
type Atribut = Record<
  string,
  string | number | boolean | null | undefined | EventListener | Partial<CSSStyleDeclaration>
>;

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAG_SVG = new Set([
  'svg',
  'path',
  'g',
  'circle',
  'rect',
  'line',
  'polyline',
  'text',
  'title',
  'defs',
  'clipPath',
]);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Atribut | null,
  ...anak: Anak[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Atribut | null, ...anak: Anak[]): Element;
export function h(tag: string, attrs: Atribut | null = null, ...anak: Anak[]): Element {
  const el = TAG_SVG.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) {
        // Pendengar hanya dari fungsi. Nilai string TIDAK pernah dipasang sebagai atribut on*
        // (mencegah handler inline dari data; CSP juga memblokirnya sebagai lapis kedua).
        if (typeof v === 'function')
          el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
        continue;
      }
      if (k === 'style' && typeof v === 'object') {
        Object.assign((el as HTMLElement).style, v);
      } else if (k === 'href' || k === 'src') {
        const s = String(v);
        // Tolak skema berbahaya (javascript:, data:) pada tautan dari data.
        if (/^\s*(javascript|data|vbscript):/i.test(s)) continue;
        el.setAttribute(k, s);
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  tambah(el, anak);
  return el;
}

function tambah(el: Element, anak: Anak[]): void {
  for (const a of anak) {
    if (a === null || a === undefined || a === false) continue;
    if (Array.isArray(a)) tambah(el, a);
    else if (a instanceof Node) el.appendChild(a);
    else el.appendChild(document.createTextNode(String(a)));
  }
}

/** Mengganti seluruh isi elemen. */
export function isi(el: Element, ...anak: Anak[]): void {
  el.replaceChildren();
  tambah(el, anak);
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Elemen tidak ditemukan: ${sel}`);
  return el;
}

/** Ikon garis sederhana (24×24) dari path SVG. */
export function ikon(d: string, label?: string): SVGSVGElement {
  const svg = h(
    'svg',
    {
      viewBox: '0 0 24 24',
      'aria-hidden': label ? null : 'true',
      role: label ? 'img' : null,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    label ? h('title', null, label) : null,
    h('path', { d }),
  ) as SVGSVGElement;
  return svg;
}

export const IKON = {
  unduh: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  cari: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3l-5.2-5.2',
  peta: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  sekolah: 'M3 10l9-5 9 5-9 5-9-5zm4 2.5V17c3 2 7 2 10 0v-4.5',
  belajar: 'M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4V5zm16 0h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7V5z',
  surat: 'M4 6h16v12H4V6zm0 0l8 7 8-7',
  centang: 'M5 12l5 5 9-10',
  silang: 'M6 6l12 12M18 6L6 18',
  jam: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  kunci: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11z',
  luar: 'M14 4h6v6m0-6L10 14M18 14v6H4V6h6',
  cetak: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7v-7z',
  wa: 'M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z',
  info: 'M12 8h.01M11 12h1v5h1m8-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
} as const;
