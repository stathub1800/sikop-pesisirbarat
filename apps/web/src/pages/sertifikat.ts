import { formatAngka, formatTanggal, RE_KODE_VERIFIKASI } from '@sikop/shared';
import { ApiError, get } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import { kerangka } from '../lib/ui.ts';
import { mulaiHalaman, param } from '../lib/umum.ts';

interface Sert {
  nomor: string;
  nama_peserta: string;
  nip_samaran: string;
  instansi: string;
  judul_kursus: string;
  nilai: number;
  terbit_at: string;
  penandatangan_nama: string;
  penandatangan_jabatan: string;
  status: 'sah' | 'dicabut';
  dicabut_alasan: string | null;
  dicabut_at: string | null;
}

mulaiHalaman();
const form = $('#form-verifikasi') as HTMLFormElement;
const input = $('#v-kode') as HTMLInputElement;

async function periksa(kode: string): Promise<void> {
  const wadah = $('#hasil-verifikasi');
  kode = kode.trim().toUpperCase();
  if (!RE_KODE_VERIFIKASI.test(kode)) {
    isi(
      wadah,
      h(
        'p',
        { class: 'pesan pesan--peringatan' },
        'Kode verifikasi terdiri dari 10 huruf dan angka, tanpa huruf O, I, L dan angka 0, 1.',
      ),
    );
    return;
  }
  isi(wadah, kerangka(3));
  history.replaceState(null, '', `?kode=${kode}`);
  try {
    const { sertifikat: s } = await get<{ sertifikat: Sert }>(`/sertifikat/${kode}`);
    const sah = s.status === 'sah';
    isi(
      wadah,
      h(
        'div',
        { class: `pesan ${sah ? 'pesan--berhasil' : 'pesan--galat'}`, role: 'status' },
        h('h2', null, sah ? 'Sertifikat sah' : 'Sertifikat telah dicabut'),
        !sah
          ? h(
              'p',
              null,
              `Dicabut pada ${formatTanggal(s.dicabut_at)}. Alasan: ${s.dicabut_alasan ?? '-'}`,
            )
          : null,
        h(
          'dl',
          { class: 'dl' },
          h('dt', null, 'Nomor'),
          h('dd', null, s.nomor),
          h('dt', null, 'Nama'),
          h('dd', null, s.nama_peserta),
          h('dt', null, 'NIP'),
          h('dd', null, s.nip_samaran),
          h('dt', null, 'Instansi'),
          h('dd', null, s.instansi),
          h('dt', null, 'Program'),
          h('dd', null, s.judul_kursus),
          h('dt', null, 'Nilai ujian akhir'),
          h('dd', null, formatAngka(s.nilai, 2)),
          h('dt', null, 'Tanggal terbit'),
          h('dd', null, formatTanggal(s.terbit_at)),
          h('dt', null, 'Penandatangan'),
          h('dd', null, `${s.penandatangan_nama}, ${s.penandatangan_jabatan}`),
        ),
      ),
    );
  } catch (e) {
    isi(
      wadah,
      h(
        'div',
        { class: 'pesan pesan--galat', role: 'alert' },
        h(
          'h2',
          null,
          e instanceof ApiError && e.status === 404
            ? 'Sertifikat tidak terdaftar'
            : 'Pemeriksaan gagal',
        ),
        h(
          'p',
          null,
          e instanceof ApiError && e.status === 404
            ? 'Tidak ada sertifikat dengan kode tersebut. Pastikan kode diketik dengan benar. Sertifikat yang tidak terdaftar di sini bukan terbitan SIKOP.'
            : e instanceof Error
              ? e.message
              : '',
        ),
      ),
    );
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void periksa(input.value);
});
const awal = param('kode');
if (awal) {
  input.value = awal.toUpperCase();
  void periksa(awal);
}
