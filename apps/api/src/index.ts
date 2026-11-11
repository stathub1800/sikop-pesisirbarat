/**
 * Worker API SIKOP v2.
 * Semua rute berada di bawah /api/v1. Diakses dari Pages melalui service binding (satu origin).
 *
 *   /api/v1/*                publik (ringkasan, wilayah, indikator, sekolah, verifikasi sertifikat)
 *   /api/v1/layanan/*        permohonan data PST
 *   /api/v1/auth/*           masuk/keluar
 *   /api/v1/lms/*            ruang belajar
 *   /api/v1/admin/*          panel admin (berbasis peran)
 */
import { Hono } from 'hono';
import type { AppEnv, Env } from './env.ts';
import { muatSesi } from './auth/sesi.ts';
import { HttpError } from './lib/http.ts';
import { headerKeamanan, lindungiCsrf, logPermintaan } from './lib/middleware.ts';
import { adminLms } from './routes/admin/lms.ts';
import { adminIndikator, adminPengaturan, adminPermohonan } from './routes/admin/konten.ts';
import { adminSekolah } from './routes/admin/sekolah.ts';
import { adminSistem } from './routes/admin/sistem.ts';
import { auth } from './routes/auth.ts';
import { layanan } from './routes/layanan.ts';
import { lms } from './routes/lms.ts';
import { publik } from './routes/publik.ts';
import { tutupKedaluwarsa } from './services/lms.ts';

export const app = new Hono<AppEnv>().basePath('/api/v1');

app.use('*', logPermintaan, headerKeamanan, lindungiCsrf, muatSesi);

app.route('/', publik);
app.route('/layanan', layanan);
app.route('/auth', auth);
app.route('/lms', lms);
app.route('/admin', adminSistem);
app.route('/admin/sekolah', adminSekolah);
app.route('/admin/indikator', adminIndikator);
app.route('/admin/pengaturan', adminPengaturan);
app.route('/admin/permohonan', adminPermohonan);
app.route('/admin/lms', adminLms);

app.notFound((c) =>
  c.json({ galat: { kode: 'tidak_ditemukan', pesan: 'Alamat tidak ditemukan.' } }, 404),
);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { galat: { kode: err.kode, pesan: err.message, rincian: err.rincian } },
      err.status,
    );
  }
  // Detail teknis hanya di log; pengguna menerima pesan generik dan ID untuk dilaporkan.
  console.error(
    JSON.stringify({
      level: 'ERROR',
      request_id: c.get('requestId'),
      pesan: String(err),
      stack: err.stack?.slice(0, 2000),
    }),
  );
  return c.json(
    {
      galat: {
        kode: 'internal',
        pesan: `Terjadi kendala pada server. Kode laporan: ${c.get('requestId')}`,
      },
    },
    500,
  );
});

export default {
  fetch: app.fetch,
  /** Pemeliharaan harian: hapus sesi kedaluwarsa, tutup ujian yang ditinggalkan, terapkan masa simpan permohonan. */
  async scheduled(_e: ScheduledController, env: Env): Promise<void> {
    const sesi = await env.DB.prepare('DELETE FROM sesi WHERE expires_at < ?')
      .bind(new Date().toISOString())
      .run();
    const ujian = await tutupKedaluwarsa(env.DB);
    // Retensi sesuai kebijakan privasi: permohonan yang sudah ditutup lebih dari 2 tahun dihapus.
    const batasRetensi = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    const permohonan = await env.DB.prepare(
      "DELETE FROM permohonan WHERE status IN ('selesai','ditolak') AND updated_at < ?",
    )
      .bind(batasRetensi)
      .run();
    console.info(
      JSON.stringify({
        level: 'INFO',
        tugas: 'pemeliharaan',
        sesi_dihapus: sesi.meta.changes,
        ujian_ditutup: ujian,
        permohonan_dihapus: permohonan.meta.changes,
      }),
    );
  },
} satisfies ExportedHandler<Env>;
