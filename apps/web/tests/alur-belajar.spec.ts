/**
 * E2E alur lengkap ruang belajar: daftar → pre/post-test semua modul → ujian akhir → verifikasi admin →
 * sertifikat → verifikasi publik. Kunci jawaban diambil lewat API ADMIN (mensimulasikan peserta yang
 * menguasai materi); halaman peserta sendiri tidak pernah menerima kunci.
 * Hanya berjalan bila API lokal memakai DEV_LOGIN=aktif dan bank soal asli sudah di-seed.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const unik = Date.now().toString(36);
const EMAIL_PESERTA = `peserta-${unik}@uji.id`;
const ADMIN = process.env.SIKOP_ADMIN ?? 'admin@contoh.go.id';
/** Kursus yang diuji: bank soal asli (pss-2026) secara lokal, bank soal sintetis (uji) di CI. */
const KURSUS = process.env.SIKOP_KURSUS ?? 'pss-2026';
const nip = (): string => `19900101201501${'1'}${String(Math.floor(Math.random() * 900) + 100)}`;

async function masukDev(page: Page, email: string): Promise<void> {
  const r = await page.request.post('/api/v1/auth/dev', {
    headers: { 'X-SIKOP': '1' },
    data: { email, nama: email.split('@')[0] },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

async function petaKunci(api: APIRequestContext): Promise<Map<string, string>> {
  const r = await api.get(`/api/v1/admin/lms/soal?kursus=${KURSUS}`);
  expect(r.ok()).toBeTruthy();
  const { soal } = (await r.json()) as {
    soal: { pertanyaan: string; kunci: string; opsi: { id: string; text: string }[] }[];
  };
  // Pertanyaan → teks opsi yang benar.
  return new Map(soal.map((s) => [s.pertanyaan, s.opsi.find((o) => o.id === s.kunci)?.text ?? '']));
}

async function kerjakanUjian(
  page: Page,
  kunci: Map<string, string>,
  benar: boolean,
): Promise<void> {
  await expect(page.locator('.timer')).toBeVisible();
  const jumlah = await page.locator('.navigator button').count();
  for (let i = 0; i < jumlah; i++) {
    await page.locator('.navigator button').nth(i).click();
    const tanya = (await page.locator('.soal__teks').textContent())?.trim() ?? '';
    const jawab = kunci.get(tanya);
    expect(jawab, `kunci untuk "${tanya.slice(0, 40)}"`).toBeTruthy();
    const opsi = page.locator('.opsi label');
    const n = await opsi.count();
    for (let j = 0; j < n; j++) {
      const t = (await opsi.nth(j).locator('span').textContent())?.trim();
      if ((t === jawab) === benar) {
        await opsi.nth(j).click();
        break;
      }
    }
  }
  await page.getByRole('button', { name: 'Serahkan jawaban' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Serahkan' }).click();
  await expect(page.locator('h1')).toContainText('Hasil');
}

test('alur peserta sampai sertifikat terverifikasi', async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await browser.newPage();
  await masukDev(admin, ADMIN);
  const kunci = await petaKunci(admin.request);

  const page = await browser.newPage();
  await masukDev(page, EMAIL_PESERTA);
  await page.goto('/belajar/#/akun');
  await page.fill('#a-nip', nip());
  await page.fill('#a-instansi', 'Diskominfo Pesisir Barat');
  await page.fill('#a-jabatan', 'Statistisi Ahli Pertama');
  await page.check('input[name="setuju_privasi"]');
  await page.getByRole('button', { name: 'Daftar sebagai peserta' }).click();
  await expect(page.locator('.toast')).toContainText('Profil tersimpan');

  const { modul } = (await (await page.request.get(`/api/v1/lms/kursus/${KURSUS}`)).json()) as {
    modul: { id: number }[];
  };
  for (const m of modul) {
    await page.goto(`/belajar/#/modul/${m.id}`);
    await page.getByRole('button', { name: 'Mulai pre-test' }).click();
    await kerjakanUjian(page, kunci, false);
    await expect(page.locator('main')).toContainText('Pembahasan terbuka setelah Anda lulus');
    await page.goto(`/belajar/#/modul/${m.id}`);
    await page.getByRole('button', { name: 'Mulai post-test' }).click();
    await kerjakanUjian(page, kunci, true);
    await expect(page.locator('.lencana')).toContainText('Lulus');
    await expect(page.locator('.pembahasan li').first()).toBeVisible();
  }

  await page.goto(`/belajar/#/kursus/${KURSUS}`);
  await page.getByRole('button', { name: 'Mulai ujian akhir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mulai' }).click();
  await kerjakanUjian(page, kunci, true);
  await expect(page.locator('.kpi')).toContainText('100');
  // Ujian akhir tidak pernah menampilkan kunci.
  await expect(page.locator('.pembahasan')).toHaveCount(0);

  // Admin: lengkapi penandatangan, aktifkan, verifikasi peserta.
  const set = await admin.request.put('/api/v1/admin/pengaturan', {
    headers: { 'X-SIKOP': '1' },
    data: {
      penandatangan_nama: 'Nama Pejabat Uji',
      penandatangan_jabatan: 'Kepala BPS Kabupaten Pesisir Barat',
      sertifikat_aktif: '1',
    },
  });
  expect(set.ok(), await set.text()).toBeTruthy();
  await admin.goto(`/admin/#/peserta?q=${encodeURIComponent(EMAIL_PESERTA)}`);
  admin.once('dialog', (d) => void d.accept());
  await admin.getByRole('button', { name: 'Verifikasi' }).first().click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Verifikasi' }).click();
  await expect(admin.locator('.toast')).toContainText('sertifikat terbit');

  await page.goto(`/belajar/#/kursus/${KURSUS}`);
  await page.getByRole('link', { name: 'Lihat dan cetak sertifikat' }).click();
  await expect(page.locator('.sertifikat__nama')).toBeVisible();
  await expect(
    page.locator('.sertifikat svg[aria-label="Kode QR verifikasi sertifikat"]'),
  ).toBeVisible();
  await expect(page.locator('.sertifikat')).toContainText('Nama Pejabat Uji');
  await expect(page.locator('.sertifikat')).not.toContainText('Margaretha');
  const kode = (await page.locator('.sertifikat__qr p').nth(1).textContent())?.trim() ?? '';
  await page.screenshot({ path: 'test-results/sertifikat.png', fullPage: true });

  const publik = await browser.newPage();
  await publik.goto(`/sertifikat/?kode=${kode}`);
  await expect(publik.locator('#hasil-verifikasi')).toContainText('Sertifikat sah');
  await expect(publik.locator('#hasil-verifikasi')).toContainText('********');
});

test('panel admin: menu sesuai peran dan dasbor tampil', async ({ page }) => {
  await masukDev(page, ADMIN);
  await page.goto('/admin/');
  await expect(page.locator('h1')).toContainText('Selamat datang');
  for (const menu of ['Permohonan data', 'Data sekolah', 'Bank soal', 'Jejak audit'])
    await expect(page.locator('#admin-nav')).toContainText(menu);
  await page.goto('/admin/#/sekolah?koordinat=diperbaiki');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.goto('/admin/#/audit');
  await expect(page.locator('h1')).toHaveText('Jejak audit');
  await page.screenshot({ path: 'test-results/admin-audit.png', fullPage: true });
});

test('manajemen pengguna: peserta dan admin berperan mudah ditemukan, form rapi', async ({
  page,
}) => {
  await masukDev(page, ADMIN);
  await page.goto('/admin/');
  const nav = page.locator('#admin-nav');
  await expect(nav).toContainText('Manajemen pengguna');
  await nav.getByRole('link', { name: 'Peserta Ruang Belajar' }).click();
  await expect(page.locator('h1')).toHaveText('Peserta Ruang Belajar');
  await expect(page.locator('.kartu-jumlah').first()).toContainText('Semua peserta');
  // Kartu kategori menyaring daftar lewat URL.
  await page.locator('.kartu-jumlah', { hasText: 'Pelajar dan mahasiswa' }).click();
  await expect(page).toHaveURL(/kategori=pelajar/);
  await expect(page.locator('.kartu-jumlah.aktif')).toContainText('Pelajar dan mahasiswa');

  await nav.getByRole('link', { name: 'Admin dan peran' }).click();
  await expect(page.locator('h1')).toHaveText('Admin dan peran');
  await expect(page.locator('.daftar-peran li')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Tambah atau ubah admin' })).toBeVisible();

  // Kotak isian dalam satu baris sejajar dan tidak meregang (Pengaturan situs punya label dua baris).
  await page.goto('/admin/#/pengaturan');
  await expect(page.locator('.grid-isian').first()).toBeVisible();
  const salah = await page.evaluate(() => {
    const out: string[] = [];
    for (const g of document.querySelectorAll('.grid-isian')) {
      const baris = new Map<number, number[]>();
      for (const c of g.querySelectorAll<HTMLElement>(
        ':scope > .isian > input, :scope > .isian > select',
      )) {
        const r = c.getBoundingClientRect();
        if (r.height > 60) out.push(`tinggi ${c.getAttribute('name')}`);
        const k = Math.round(r.top / 60);
        baris.set(k, [...(baris.get(k) ?? []), r.top]);
      }
      for (const t of baris.values())
        if (Math.max(...t) - Math.min(...t) > 2) out.push(`tidak sejajar ${t.join(',')}`);
    }
    return out;
  });
  expect(salah).toEqual([]);
});

test('akun tanpa peran tidak dapat memakai panel admin', async ({ page }) => {
  await masukDev(page, `bukanadmin-${unik}@uji.id`);
  await page.goto('/admin/');
  await expect(page.locator('h1')).toHaveText('Tidak ada akses admin');
  const r = await page.request.get('/api/v1/admin/dasbor');
  expect(r.status()).toBe(403);
});
