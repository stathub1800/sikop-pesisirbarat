/**
 * Penyaji Markdown terbatas yang aman dari XSS, tanpa dependensi.
 *
 * Seluruh keluaran dibuat dengan h() (teks lewat createTextNode), sehingga HTML mentah di dalam Markdown
 * tampil sebagai teks biasa dan tidak pernah menjadi elemen. Tautan hanya boleh https: atau jalur situs sendiri.
 *
 * Didukung: judul (#, ##, ###, ####), paragraf, daftar bertitik dan bernomor, kutipan (>), blok kode (```),
 * garis pemisah (---), serta tebal (**), miring (*), kode sebaris (`), dan tautan [teks](url).
 */
import { h } from './dom.ts';

type Simpul = Node | string;

const tautanAman = (url: string): string | null =>
  /^https:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]*$/.test(url) ? url : null;

const RE_INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

/** Mengurai bagian sebaris menjadi simpul DOM. */
export function sebaris(teks: string): Simpul[] {
  const out: Simpul[] = [];
  let akhir = 0;
  for (const m of teks.matchAll(RE_INLINE)) {
    const awal = m.index ?? 0;
    if (awal > akhir) out.push(teks.slice(akhir, awal));
    const [semua] = m;
    if (m[1]) out.push(h('code', null, semua.slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, ...sebaris(semua.slice(2, -2))));
    else if (m[3]) out.push(h('em', null, ...sebaris(semua.slice(1, -1))));
    else {
      const t = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(semua);
      const url = t ? tautanAman(t[2]!) : null;
      if (t && url)
        out.push(
          h(
            'a',
            {
              href: url,
              target: url.startsWith('/') ? null : '_blank',
              rel: 'noopener noreferrer',
            },
            ...sebaris(t[1]!),
          ),
        );
      else out.push(t ? t[1]! : semua);
    }
    akhir = awal + semua.length;
  }
  if (akhir < teks.length) out.push(teks.slice(akhir));
  return out;
}

const RE_DAFTAR_TITIK = /^\s*[-*]\s+(.*)$/;
const RE_DAFTAR_NOMOR = /^\s*\d{1,3}[.)]\s+(.*)$/;
const RE_JUDUL = /^(#{1,4})\s+(.*)$/;

/** Mengubah teks Markdown menjadi elemen pembungkus `.markdown`. */
export function markdown(teks: string): HTMLElement {
  const baris = teks.replace(/\r\n?/g, '\n').split('\n');
  const akar = h('div', { class: 'markdown' });
  let i = 0;
  while (i < baris.length) {
    const b = baris[i]!;
    if (b.trim() === '') {
      i++;
      continue;
    }
    if (b.trim().startsWith('```')) {
      const kode: string[] = [];
      i++;
      while (i < baris.length && !baris[i]!.trim().startsWith('```')) kode.push(baris[i++]!);
      i++;
      akar.appendChild(h('pre', null, h('code', null, kode.join('\n'))));
      continue;
    }
    const j = RE_JUDUL.exec(b);
    if (j) {
      // Halaman pelajaran sudah memakai h1; # dan ## menjadi h2, ### h3, #### h4.
      const tingkat = Math.max(2, j[1]!.length);
      akar.appendChild(h(`h${tingkat}` as 'h2', null, ...sebaris(j[2]!.trim())));
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(b)) {
      akar.appendChild(h('hr'));
      i++;
      continue;
    }
    if (b.startsWith('>')) {
      const isi: string[] = [];
      while (i < baris.length && baris[i]!.startsWith('>'))
        isi.push(baris[i++]!.replace(/^>\s?/, ''));
      akar.appendChild(h('blockquote', null, h('p', null, ...sebaris(isi.join(' ').trim()))));
      continue;
    }
    const titik = RE_DAFTAR_TITIK.test(b);
    const nomor = !titik && RE_DAFTAR_NOMOR.test(b);
    if (titik || nomor) {
      const re = titik ? RE_DAFTAR_TITIK : RE_DAFTAR_NOMOR;
      const butir: Node[] = [];
      while (i < baris.length && re.test(baris[i]!)) {
        butir.push(h('li', null, ...sebaris(re.exec(baris[i]!)![1]!.trim())));
        i++;
      }
      akar.appendChild(h(titik ? 'ul' : 'ol', null, ...butir));
      continue;
    }
    const para: string[] = [];
    while (
      i < baris.length &&
      baris[i]!.trim() !== '' &&
      !RE_JUDUL.test(baris[i]!) &&
      !RE_DAFTAR_TITIK.test(baris[i]!) &&
      !RE_DAFTAR_NOMOR.test(baris[i]!) &&
      !baris[i]!.startsWith('>') &&
      !baris[i]!.trim().startsWith('```')
    )
      para.push(baris[i++]!.trim());
    akar.appendChild(h('p', null, ...sebaris(para.join(' '))));
  }
  return akar;
}
