/**
 * Uji regresi XSS untuk pembuat DOM h(): data dari API/pengguna tidak boleh pernah menjadi HTML aktif.
 */
import { describe, expect, it } from 'vitest';
import { h, isi } from './dom.ts';

describe('h() aman dari XSS', () => {
  it('teks berisi tag tetap teks, tidak menjadi elemen', () => {
    const el = h('p', null, '<img src=x onerror=alert(1)><script>alert(2)</script>');
    expect(el.children).toHaveLength(0);
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain('<img');
  });

  it('menolak tautan javascript:, data:, dan vbscript:', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'data:text/html,<script>1</script>',
      'vbscript:x',
    ]) {
      expect(h('a', { href }, 'x').hasAttribute('href'), href).toBe(false);
    }
    expect(h('a', { href: 'https://bps.go.id' }).getAttribute('href')).toBe('https://bps.go.id');
    expect(h('a', { href: '/sekolah/?q=a' }).getAttribute('href')).toBe('/sekolah/?q=a');
  });

  it('nilai atribut dengan kutip tidak dapat keluar dari atribut', () => {
    const el = h('div', { title: '"><script>alert(1)</script>' });
    expect(el.getAttribute('title')).toBe('"><script>alert(1)</script>');
    expect(el.querySelector('script')).toBeNull();
  });

  it('pendengar peristiwa hanya dari fungsi, bukan string', () => {
    const el = h('button', { onclick: 'alert(1)' as unknown as EventListener });
    expect(el.hasAttribute('onclick')).toBe(false);
    let dipanggil = 0;
    const b = h('button', { onclick: () => dipanggil++ });
    b.click();
    expect(dipanggil).toBe(1);
  });

  it('null, false, undefined diabaikan; angka dan larik diratakan', () => {
    const el = h('ul', null, null, false, undefined, [h('li', null, 1), [h('li', null, 2)]]);
    expect(el.querySelectorAll('li')).toHaveLength(2);
    isi(el, 'ganti');
    expect(el.textContent).toBe('ganti');
  });
});
