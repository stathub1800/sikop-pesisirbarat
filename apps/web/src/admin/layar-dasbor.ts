import { formatAngka, KOORDINAT_LABEL, type KoordinatStatus } from '@sikop/shared';
import { get } from '../lib/api.ts';
import { h, isi } from '../lib/dom.ts';
import type { Konteks } from './main.ts';

interface Dasbor {
  sekolah: {
    total: number;
    tayang: number;
    koordinat: { status: KoordinatStatus; n: number }[];
  } | null;
  permohonan: { status: string; n: number }[] | null;
  lms: {
    peserta: { status: string; n: number }[];
    sertifikat: { status: string; n: number }[];
    ujian: { jenis: string; n: number; rata: number }[];
    sertifikat_aktif: boolean;
    penandatangan_lengkap: boolean;
  } | null;
}

const n = (arr: { status: string; n: number }[] | undefined, s: string): number =>
  arr?.find((x) => x.status === s)?.n ?? 0;
const baris = (label: string, nilai: number | string, href?: string): HTMLElement =>
  h(
    'li',
    null,
    href ? h('a', { href }, label) : h('span', null, label),
    h('strong', { class: 'angka' }, typeof nilai === 'number' ? formatAngka(nilai) : nilai),
  );

export async function layarDasbor(k: Konteks): Promise<void> {
  const d = await get<Dasbor>('/admin/dasbor');
  const panel: HTMLElement[] = [];
  if (d.permohonan) {
    const baru = n(d.permohonan, 'baru');
    panel.push(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Permohonan data'),
        baru
          ? h(
              'p',
              { class: 'pesan pesan--peringatan' },
              `${baru} permohonan baru menunggu ditangani.`,
            )
          : h('p', { class: 'isian__bantu' }, 'Tidak ada permohonan baru.'),
        h(
          'ul',
          null,
          baris('Baru', baru, '#/permohonan?status=baru'),
          baris('Diproses', n(d.permohonan, 'diproses'), '#/permohonan?status=diproses'),
          baris('Selesai', n(d.permohonan, 'selesai')),
          baris('Ditolak', n(d.permohonan, 'ditolak')),
        ),
      ),
    );
  }
  if (d.sekolah) {
    const perlu = d.sekolah.koordinat.filter((x) => x.status !== 'valid');
    panel.push(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Mutu data sekolah'),
        h(
          'ul',
          null,
          baris('Sekolah terdaftar', d.sekolah.total, '#/sekolah'),
          baris('Tayang di situs', d.sekolah.tayang),
          ...perlu.map((x) =>
            baris(KOORDINAT_LABEL[x.status], x.n, `#/sekolah?koordinat=${x.status}`),
          ),
        ),
      ),
    );
  }
  if (d.lms) {
    const peringatan = !d.lms.penandatangan_lengkap
      ? 'Nama dan jabatan penandatangan sertifikat belum diisi.'
      : !d.lms.sertifikat_aktif
        ? 'Penerbitan sertifikat belum diaktifkan.'
        : null;
    panel.push(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, 'Ruang belajar'),
        peringatan
          ? h(
              'p',
              { class: 'pesan pesan--peringatan' },
              peringatan,
              ' ',
              h('a', { href: '#/pengaturan' }, 'Buka pengaturan'),
            )
          : null,
        h(
          'ul',
          null,
          baris(
            'Peserta menunggu verifikasi',
            n(d.lms.peserta, 'menunggu'),
            '#/peserta?status=menunggu',
          ),
          baris('Peserta terverifikasi', n(d.lms.peserta, 'terverifikasi')),
          baris('Sertifikat sah', n(d.lms.sertifikat, 'sah'), '#/sertifikat'),
          ...d.lms.ujian.map((u) =>
            baris(
              `Rata-rata nilai ${u.jenis === 'akhir' ? 'ujian akhir' : `${u.jenis}-test`} (${formatAngka(u.n)} percobaan)`,
              formatAngka(u.rata ?? 0, 1),
            ),
          ),
        ),
      ),
    );
  }
  isi(
    k.isi,
    h('h1', null, `Selamat datang, ${k.akun.nama}`),
    h('div', { class: 'ringkas-dasbor' }, panel),
  );
}
