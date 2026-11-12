/**
 * E2E Fase 2: katalog bersaringan, silabus, pemutar pelajaran, pendaftaran bercabang, dan Kursus saya,
 * memakai kursus contoh sintetis `membaca-data-bps` (npm run data:lms:contoh). Berjalan di desktop dan ponsel.
 * Jawaban latihan dibaca dari berkas sumber kursus contoh; halaman peserta sendiri tidak pernah menerima kunci.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const KURSUS = 'membaca-data-bps';
const sumber = JSON.parse(
  readFileSync(new URL('../../../data/lms/kursus-contoh.json', import.meta.url), 'utf8'),
) as {
  soal_latihan: {
    pertanyaan: string;
    kunci: string;
    opsi: { id: string; text: string }[];
  }[];
};
const kunciLatihan = new Map(
  sumber.soal_latihan.map((s) => [s.pertanyaan, s.opsi.find((o) => o.id === s.kunci)!.text]),
);

async function masukDev(page: Page, email: string): Promise<void> {
  const r = await page.request.post('/api/v1/auth/dev', {
    headers: { 'X-SIKOP': '1' },
    data: { email, nama: email.split('@')[0] },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
}

/** Mengisi latihan: benar bila `benar`, selain itu memilih opsi yang salah. */
async function isiLatihan(page: Page, benar: boolean): Promise<void> {
  const kotak = page.locator('.latihan__soal');
  const n = await kotak.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const soal = kotak.nth(i);
    const tanya = ((await soal.locator('legend').textContent()) ?? '')
      .replace(/^\d+\.\s*/, '')
      .trim();
    const jawab = kunciLatihan.get(tanya);
    expect(jawab, `kunci untuk "${tanya.slice(0, 40)}"`).toBeTruthy();
    const opsi = soal.locator('.latihan__opsi');
    const m = await opsi.count();
    for (let j = 0; j < m; j++) {
      const t = ((await opsi.nth(j).locator('span').textContent()) ?? '').trim();
      if ((t === jawab) === benar) {
        await opsi.nth(j).locator('input').check();
        break;
      }
    }
  }
}

test('katalog: saringan tersimpan di URL dan kursus contoh muncul', async ({ page }) => {
  await page.goto('/belajar/#/');
  await expect(page.locator('h1')).toHaveText('Ruang Belajar');
  const kartu = page.locator('.kartu-kursus', { hasText: 'Membaca Data BPS' });
  await expect(kartu).toBeVisible();
  await expect(kartu).toContainText('Dasar');
  await expect(kartu).toContainText('Bersertifikat');
  await expect(kartu).toContainText('9 pelajaran');

  await page.selectOption('#f-sasaran', 'pelajar');
  await expect(kartu).toBeVisible();
  await page.selectOption('#f-level', 'lanjut');
  await expect(page.locator('.grid-kursus')).toContainText('Tidak ada kursus yang cocok');
  expect(page.url()).toContain('level=lanjut');
  expect(page.url()).toContain('sasaran=pelajar');

  // Muat ulang: saringan dipulihkan dari URL.
  await page.reload();
  await expect(page.locator('#f-level')).toHaveValue('lanjut');
  await expect(page.locator('.grid-kursus')).toContainText('Tidak ada kursus yang cocok');

  await page.selectOption('#f-level', '');
  await page.fill('#f-cari', 'data bps');
  await expect(kartu).toBeVisible();
  await page.fill('#f-cari', 'tidak-ada-judul-ini');
  await expect(page.locator('.grid-kursus')).toContainText('Tidak ada kursus yang cocok');
});

test('halaman kursus publik: hasil belajar, silabus, dan syarat; isi pelajaran tertutup', async ({
  page,
}, info) => {
  await page.goto(`/belajar/#/kursus/${KURSUS}`);
  await expect(page.locator('h1')).toContainText('Membaca Data BPS');
  await expect(page.locator('main')).toContainText('Yang akan Anda pelajari');
  await expect(page.locator('.silabus__bab')).toHaveCount(3);
  // Bab pertama terbuka; bab lain dapat dibuka dengan klik ringkasannya.
  await expect(page.locator('.silabus__bab').first()).toHaveJSProperty('open', true);
  await page.locator('.silabus__bab > summary').nth(1).click();
  await expect(page.locator('.silabus__bab').nth(1)).toHaveJSProperty('open', true);
  await expect(page.locator('main')).toContainText('Syarat kelulusan dan sertifikat');
  await expect(page.getByRole('link', { name: 'Masuk untuk mulai belajar' })).toBeVisible();
  await page.screenshot({
    path: `test-results/kursus-terang-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: `test-results/kursus-gelap-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'light' });

  // Silabus publik tidak memuat isi pelajaran atau kunci; isinya hanya untuk peserta terdaftar.
  const publik = await page.request.get(`/api/v1/lms/kursus/${KURSUS}`);
  const teks = await publik.text();
  expect(teks).not.toContain('youtube');
  expect(teks).not.toContain('kunci');
  const tertutup = await page.request.get('/api/v1/lms/pelajaran/200101');
  expect(tertutup.status()).toBe(401);
});

test('pendaftaran bercabang per kategori', async ({ page }, info) => {
  await masukDev(page, `cabang-${info.project.name}-${Date.now().toString(36)}@uji.id`);
  await page.goto('/belajar/#/akun');
  await expect(page.locator('#a-nip')).toBeVisible();
  await page.selectOption('#a-kategori', 'umum');
  await expect(page.locator('#a-nip')).toHaveCount(0);
  await expect(page.locator('#a-pekerjaan')).toBeVisible();
  await page.selectOption('#a-kategori', 'mitra');
  await expect(page.locator('#a-kegiatan')).toBeVisible();
  await page.selectOption('#a-kategori', 'pelajar');
  await expect(page.locator('#a-sekolah')).toBeVisible();
  await page.screenshot({
    path: `test-results/akun-pelajar-${info.project.name}.png`,
    fullPage: true,
  });
});

test('alur belajar peserta pelajar: daftar, pelajaran, latihan, progres, kursus saya', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const email = `pelajar-${info.project.name}-${Date.now().toString(36)}@uji.id`;
  await masukDev(page, email);

  // Daftar sebagai pelajar: tanpa NIP.
  await page.goto('/belajar/#/akun');
  await page.selectOption('#a-kategori', 'pelajar');
  await page.fill('#a-sekolah', 'SMAN 1 Pesisir Barat');
  await page.check('input[name="setuju_privasi"]');
  await page.getByRole('button', { name: 'Daftar sebagai peserta' }).click();
  await expect(page.locator('.toast')).toContainText('Profil tersimpan');

  await page.goto(`/belajar/#/kursus/${KURSUS}`);
  await page.getByRole('link', { name: 'Mulai belajar' }).click();
  await expect(page).toHaveURL(new RegExp(`#/belajar/${KURSUS}/200101$`));

  // Video: hanya youtube-nocookie.
  const bingkai = page.locator('iframe.video');
  await expect(bingkai).toBeVisible();
  expect(await bingkai.getAttribute('src')).toMatch(
    /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
  );
  await page.screenshot({
    path: `test-results/pemutar-terang-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({
    path: `test-results/pemutar-gelap-${info.project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByRole('button', { name: 'Tandai selesai' }).click();
  await expect(page.locator('.pemutar__aksi')).toContainText('Selesai');
  await page.getByRole('link', { name: 'Berikutnya' }).click();

  // Bacaan Markdown disajikan sebagai elemen aman.
  await expect(page.locator('.markdown')).toBeVisible();
  await expect(page.locator('.markdown script, .markdown iframe, .markdown [onclick]')).toHaveCount(
    0,
  );

  // Daftar pelajaran: di ponsel berupa laci, di desktop sidebar tetap.
  const buka = page.locator('.pemutar__buka');
  if (await buka.isVisible()) {
    await expect(page.locator('.pemutar__sisi')).toBeHidden();
    await buka.click();
    await expect(page.locator('.pemutar__sisi')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pemutar__sisi')).toBeHidden();
  } else {
    await expect(page.locator('.pemutar__sisi')).toBeVisible();
    await expect(page.locator('.pemutar__sisi li.aktif')).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Tandai selesai' }).click();
  await page.getByRole('link', { name: 'Berikutnya' }).click();

  // Latihan: jawaban salah tidak menyelesaikan pelajaran dan tidak membocorkan kunci.
  await expect(page.locator('.latihan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tandai selesai' })).toHaveCount(0);
  await isiLatihan(page, false);
  await page.getByRole('button', { name: 'Periksa jawaban' }).click();
  await expect(page.locator('.latihan')).toContainText('Belum tepat');
  await expect(page.locator('.pemutar__aksi')).not.toContainText('Latihan lulus');
  // Jawaban benar: lulus dan pelajaran selesai.
  await isiLatihan(page, true);
  await page.getByRole('button', { name: 'Periksa jawaban' }).click();
  await expect(page.locator('.pemutar__aksi')).toContainText('Latihan lulus');

  // Selesaikan sisa pelajaran lewat Berikutnya sampai pelajaran terakhir.
  for (let i = 0; i < 20; i++) {
    const berikut = page.getByRole('link', { name: 'Berikutnya' });
    if ((await berikut.count()) === 0) break;
    const judulLama = await page.locator('#judul-pelajaran').textContent();
    await berikut.click();
    // Tunggu sampai pelajaran berikutnya benar-benar tampil sebelum mengerjakannya.
    await expect(page.locator('#judul-pelajaran')).not.toHaveText(judulLama ?? '');
    if (await page.locator('.latihan').count()) {
      await isiLatihan(page, true);
      await page.getByRole('button', { name: 'Periksa jawaban' }).click();
      await expect(page.locator('.pemutar__aksi')).toContainText('Latihan lulus');
    } else {
      const tandai = page.getByRole('button', { name: 'Tandai selesai' });
      if (await tandai.count()) await tandai.click();
      await expect(page.locator('.pemutar__aksi')).toContainText('Selesai');
    }
  }
  await page.getByRole('link', { name: 'Ke halaman kursus' }).click();
  await expect(page.locator('.progres')).toContainText('100%');
  // Ujian akhir tetap terkunci sebelum post-test bab lulus.
  await expect(page.locator('main')).toContainText(
    'Ujian akhir terbuka setelah semua post-test modul lulus',
  );
  const terkunci = await page.request.post('/api/v1/lms/ujian', {
    headers: { 'X-SIKOP': '1' },
    data: { kursus_id: KURSUS, jenis: 'akhir' },
  });
  expect(terkunci.status()).toBe(409);

  await page.goto('/belajar/#/saya');
  await expect(page.locator('h1')).toHaveText('Kursus saya');
  const kartu = page.locator('.kursus-saya', { hasText: 'Membaca Data BPS' });
  await expect(kartu).toContainText('100%');
  await expect(kartu.getByRole('link', { name: 'Buka kursus' })).toBeVisible();
  await page.screenshot({
    path: `test-results/kursus-saya-${info.project.name}.png`,
    fullPage: true,
  });

  // Beranda katalog menampilkan "Lanjutkan belajar" hanya bila ada pelajaran tersisa; di sini semua selesai.
  await page.goto('/belajar/#/');
  await expect(page.locator('.kartu-kursus', { hasText: 'Membaca Data BPS' })).toBeVisible();
});
