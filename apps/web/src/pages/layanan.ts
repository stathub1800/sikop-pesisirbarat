/**
 * Layanan Data (perbaikan K03). Pesan berhasil HANYA tampil setelah server mengonfirmasi
 * penyimpanan dan mengembalikan nomor tiket.
 */
import { formatTanggal, LABEL_KATEGORI_PERMOHONAN, KATEGORI_PERMOHONAN } from '@sikop/shared';
import { kirim } from '../lib/api.ts';
import { $, h, ikon, IKON, isi } from '../lib/dom.ts';
import { situs } from '../lib/situs.ts';
import { lencanaStatus, sibuk, tampilkanGalatForm, toast } from '../lib/ui.ts';
import { mulaiHalaman, param } from '../lib/umum.ts';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        o: { sitekey: string; language?: string; callback?: (t: string) => void },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

mulaiHalaman();

const form = $('#form-permohonan') as HTMLFormElement;
const kategori = $('#p-kategori') as HTMLSelectElement;
for (const k of KATEGORI_PERMOHONAN)
  kategori.appendChild(h('option', { value: k }, LABEL_KATEGORI_PERMOHONAN[k]));
const perihal = param('perihal');
if (perihal) {
  ($('#p-pesan') as HTMLTextAreaElement).value = `${perihal.slice(0, 200)}\n\n`;
  kategori.value = 'lainnya';
}

let tokenTurnstile = '';
let idTurnstile: string | undefined;

const STATUS: Record<string, [string, 'biru' | 'kuning' | 'hijau' | 'merah']> = {
  baru: ['Diterima, menunggu ditangani', 'biru'],
  diproses: ['Sedang diproses', 'kuning'],
  selesai: ['Selesai', 'hijau'],
  ditolak: ['Tidak dapat dipenuhi', 'merah'],
};

async function siapkan(): Promise<void> {
  const s = await situs().catch(() => null);
  if (!s) return;
  const p = s.pengaturan;
  const kontak = [
    p.pst_whatsapp &&
      h(
        'li',
        null,
        h(
          'a',
          {
            class: 'tombol',
            href: `https://wa.me/${p.pst_whatsapp}`,
            target: '_blank',
            rel: 'noopener',
          },
          ikon(IKON.wa),
          'WhatsApp PST',
        ),
      ),
    p.pst_email &&
      h(
        'li',
        null,
        h('a', { class: 'tombol', href: `mailto:${p.pst_email}` }, ikon(IKON.surat), p.pst_email),
      ),
    p.pst_telepon && h('li', null, `Telepon: ${p.pst_telepon}`),
    p.alamat && h('li', null, p.alamat),
  ].filter(Boolean) as HTMLElement[];
  if (kontak.length) {
    isi($('#kontak-langsung ul'), kontak);
    $('#kontak-langsung').hidden = false;
  }
  if (s.turnstile_site_key) {
    const skrip = h('script', {
      src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      async: true,
    });
    skrip.addEventListener('load', () => {
      idTurnstile = window.turnstile?.render($('#turnstile'), {
        sitekey: s.turnstile_site_key,
        language: 'id',
        callback: (t) => (tokenTurnstile = t),
      });
    });
    document.head.appendChild(skrip);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const body = {
    nama: String(data.get('nama') ?? ''),
    email: String(data.get('email') ?? ''),
    no_hp: String(data.get('no_hp') ?? ''),
    instansi: String(data.get('instansi') ?? ''),
    kategori: String(data.get('kategori') ?? ''),
    pesan: String(data.get('pesan') ?? ''),
    setuju_privasi: data.get('setuju_privasi') === 'on',
    situs: String(data.get('situs') ?? ''),
    turnstile_token: tokenTurnstile,
  };
  const tombol = form.querySelector('button[type=submit]') as HTMLButtonElement;
  await sibuk(tombol, async () => {
    try {
      const r = await kirim<{ tiket: string; created_at: string }>(
        'POST',
        '/layanan/permohonan',
        body,
      );
      tampilBerhasil(r.tiket, r.created_at, body.email);
    } catch (err) {
      tampilkanGalatForm(form, err);
      if (idTurnstile) window.turnstile?.reset(idTurnstile);
    }
  });
});

function tampilBerhasil(tiket: string, waktu: string, email: string): void {
  const salin = h(
    'button',
    {
      class: 'tombol tombol--kecil',
      type: 'button',
      onclick: async () => {
        await navigator.clipboard.writeText(tiket).catch(() => undefined);
        toast('Nomor tiket disalin.', 'berhasil');
      },
    },
    'Salin nomor tiket',
  );
  isi(
    $('#wadah-form'),
    h(
      'div',
      { class: 'pesan pesan--berhasil', role: 'status', tabindex: '-1', id: 'konfirmasi' },
      h('h3', null, 'Permohonan tersimpan'),
      h(
        'p',
        null,
        `Diterima pada ${formatTanggal(waktu, true)}. Simpan nomor tiket berikut untuk mengecek status:`,
      ),
      h('p', { class: 'tiket angka' }, tiket),
      h(
        'div',
        { class: 'baris-tombol' },
        salin,
        h(
          'button',
          {
            class: 'tombol tombol--kecil tombol--polos',
            type: 'button',
            onclick: () => location.reload(),
          },
          'Ajukan permohonan lain',
        ),
      ),
    ),
  );
  ($('#s-tiket') as HTMLInputElement).value = tiket;
  ($('#s-email') as HTMLInputElement).value = email;
  $('#konfirmasi').focus();
}

const formStatus = $('#form-status') as HTMLFormElement;
formStatus.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(formStatus);
  const tombol = formStatus.querySelector('button') as HTMLButtonElement;
  await sibuk(tombol, async () => {
    try {
      const r = await kirim<{
        permohonan: {
          tiket: string;
          kategori: string;
          status: string;
          tanggapan: string | null;
          created_at: string;
          updated_at: string;
        };
      }>('POST', '/layanan/permohonan/status', {
        tiket: String(d.get('tiket') ?? '').trim(),
        email: String(d.get('email') ?? ''),
      });
      const p = r.permohonan;
      const [label, warna] = STATUS[p.status] ?? [p.status, 'biru'];
      isi(
        $('#hasil-status'),
        h(
          'div',
          { class: 'panel', style: { marginTop: 'var(--s-4)', background: 'var(--permukaan-2)' } },
          h('p', null, h('strong', null, p.tiket), ' ', lencanaStatus(label, warna)),
          h(
            'p',
            { class: 'isian__bantu' },
            `Diajukan ${formatTanggal(p.created_at, true)}. Terakhir diperbarui ${formatTanggal(p.updated_at, true)}.`,
          ),
          p.tanggapan
            ? [
                h('h3', null, 'Tanggapan petugas'),
                h('p', { style: { whiteSpace: 'pre-wrap' } }, p.tanggapan),
              ]
            : h('p', null, 'Belum ada tanggapan. Petugas akan menjawab melalui email Anda.'),
        ),
      );
    } catch (err) {
      tampilkanGalatForm(formStatus, err);
      isi($('#hasil-status'));
    }
  });
});

if (location.hash === '#status') ($('#s-tiket') as HTMLInputElement).focus();
void siapkan();
