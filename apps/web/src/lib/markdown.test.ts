/**
 * Penyaji Markdown: HTML mentah, skrip, dan tautan berbahaya tidak pernah menjadi elemen aktif.
 */
import { describe, expect, it } from 'vitest';
import { markdown } from './markdown.ts';

describe('markdown() struktur', () => {
  it('judul, paragraf, daftar, kutipan, kode, dan garis', () => {
    const el = markdown(
      [
        '# Judul besar',
        '### Anak judul',
        '',
        'Paragraf **tebal**, *miring*, dan `kode`.',
        'Baris lanjutan.',
        '',
        '- satu',
        '- dua',
        '',
        '1. pertama',
        '2) kedua',
        '',
        '> kutipan',
        '',
        '```',
        '<b>bukan html</b>',
        '```',
        '---',
      ].join('\n'),
    );
    expect(el.querySelector('h2')?.textContent).toBe('Judul besar');
    expect(el.querySelector('h3')?.textContent).toBe('Anak judul');
    expect(el.querySelector('p strong')?.textContent).toBe('tebal');
    expect(el.querySelector('p em')?.textContent).toBe('miring');
    expect(el.querySelector('p code')?.textContent).toBe('kode');
    expect(el.querySelector('p')?.textContent).toContain('Baris lanjutan.');
    expect(el.querySelectorAll('ul li')).toHaveLength(2);
    expect(el.querySelectorAll('ol li')).toHaveLength(2);
    expect(el.querySelector('blockquote')?.textContent).toBe('kutipan');
    expect(el.querySelector('pre code')?.textContent).toBe('<b>bukan html</b>');
    expect(el.querySelector('pre b')).toBeNull();
    expect(el.querySelector('hr')).not.toBeNull();
  });
});

describe('markdown() aman dari XSS', () => {
  it('HTML mentah tampil sebagai teks', () => {
    const el = markdown(
      '<img src=x onerror=alert(1)> <script>alert(2)</script>\n\n<iframe src="https://evil.example"></iframe>',
    );
    expect(el.querySelector('img, script, iframe')).toBeNull();
    expect(el.textContent).toContain('<img src=x');
    expect(el.textContent).toContain('<script>');
  });

  it('hanya tautan https dan jalur situs yang menjadi tautan', () => {
    const el = markdown(
      [
        '[aman](https://bps.go.id/a?b=1)',
        '[lokal](/peta/)',
        '[js](javascript:alert(1))',
        '[data](data:text/html,x)',
        '[http](http://bps.go.id)',
        '[proto](//evil.example/x)',
      ].join(' '),
    );
    const href = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(href).toEqual(['https://bps.go.id/a?b=1', '/peta/']);
    expect(el.textContent).toContain('js');
    expect(el.textContent).not.toContain('javascript:');
    const luar = el.querySelector('a[href^="https"]')!;
    expect(luar.getAttribute('rel')).toBe('noopener noreferrer');
    expect(luar.getAttribute('target')).toBe('_blank');
    expect(el.querySelector('a[href="/peta/"]')!.hasAttribute('target')).toBe(false);
  });

  it('atribut penyisip di teks tautan dan judul tidak menjadi atribut', () => {
    const el = markdown(
      '## <a href="javascript:alert(1)" onclick="x()">klik</a>\n\n[**<b>x</b>**](https://bps.go.id)',
    );
    expect(el.querySelector('h2 a')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelectorAll('[onclick]')).toHaveLength(0);
  });

  it('masukan kosong atau hanya spasi menghasilkan pembungkus kosong', () => {
    expect(markdown('').children).toHaveLength(0);
    expect(markdown('   \n\n  ').children).toHaveLength(0);
  });
});
