/** Halaman statis (privasi, tentang, 404): isian dinamis kecil dari pengaturan situs. */
import { formatTanggal } from '@sikop/shared';
import { h, isi } from '../lib/dom.ts';
import { situs } from '../lib/situs.ts';
import { mulaiHalaman } from '../lib/umum.ts';

mulaiHalaman();

void situs()
  .then((s) => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tanggal]')) {
      const v = s.pengaturan[el.dataset.tanggal ?? ''];
      if (v) el.textContent = formatTanggal(v);
    }
    const tim = JSON.parse(s.pengaturan.tim_json || '[]') as { nama: string; peran: string }[];
    const daftarTim = document.getElementById('daftar-tim');
    if (daftarTim && tim.length)
      isi(
        daftarTim,
        tim.map((t) => h('li', null, `${t.nama}, ${t.peran}`)),
      );
    const mitra = JSON.parse(s.pengaturan.mitra_json || '[]') as { nama: string; url?: string }[];
    const bagian = document.getElementById('mitra');
    if (bagian && mitra.length) {
      isi(
        document.getElementById('daftar-mitra')!,
        mitra.map((m) =>
          h(
            'li',
            null,
            m.url ? h('a', { href: m.url, rel: 'noopener', target: '_blank' }, m.nama) : m.nama,
          ),
        ),
      );
      bagian.hidden = false;
    }
  })
  .catch(() => undefined);
