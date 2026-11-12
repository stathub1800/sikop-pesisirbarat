/**
 * E2E halaman publik: fungsi utama, kebenaran angka, dan aksesibilitas dasar (desktop dan ponsel).
 */
import { expect, test, type Page } from '@playwright/test';

const galatKonsol = (page: Page): string[] => {
  const g: string[] = [];
  page.on('pageerror', (e) => g.push(String(e)));
  page.on('console', (m) => {
    // Peta dasar eksternal boleh gagal (lingkungan tanpa internet); itu ditangani dengan latar cadangan.
    if (m.type() === 'error' && !/openfreemap|ERR_TUNNEL|Failed to fetch|net::ERR/.test(m.text()))
      g.push(m.text());
  });
  return g;
};

async function periksaA11yDasar(page: Page): Promise<void> {
  await expect(page.locator('h1')).toHaveCount(1);
  const tanpaNama = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')]
      .filter((el) => {
        const e = el as HTMLElement;
        if (e.offsetParent === null && e.getAttribute('aria-hidden') !== 'false') return false;
        const label = e.id ? document.querySelector(`label[for="${e.id}"]`) : null;
        return !(
          e.textContent?.trim() ||
          e.getAttribute('aria-label') ||
          e.getAttribute('title') ||
          label ||
          e.closest('label') ||
          e.getAttribute('placeholder')
        );
      })
      .map((e) => `${e.tagName.toLowerCase()}.${e.getAttribute('class') ?? ''}#${e.id}`),
  );
  expect(tanpaNama, 'elemen interaktif tanpa nama aksesibel').toEqual([]);
  const lebarBerlebih = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(lebarBerlebih, 'tidak boleh ada gulir horizontal').toBeLessThanOrEqual(1);
}

test('beranda: pintu masuk ringkas, sorotan lintas tema, angka dari basis data', async ({
  page,
}) => {
  const galat = galatKonsol(page);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Data Pesisir Barat dalam satu peta.');
  // Dua pintu utama.
  await expect(page.locator('.pembuka__aksi a[href="/peta/"]')).toBeVisible();
  await expect(page.locator('.pembuka__aksi a[href="/belajar/"]')).toBeVisible();
  // Isi SIKOP dari API, bukan angka tertulis tetap.
  await expect(page.locator('#isi-data')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#isi-data')).not.toContainText('–');
  // Enam sorotan, satu per tema; kartu pertama aktif dan mewarnai peta.
  const kartu = page.locator('.kartu-sorot');
  await expect(kartu).toHaveCount(6);
  await expect(kartu.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.peta-pesisir a')).toHaveCount(11);
  await expect(page.locator('#daftar-kecamatan li')).toHaveCount(11);
  // Memilih sorotan lain mengganti judul peta dan tautan ke Peta Tematik.
  await kartu.filter({ hasText: 'Kebencanaan' }).click();
  await expect(kartu.filter({ hasText: 'Kebencanaan' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sorotan-nama')).toContainText(/tsunami/i);
  await expect(page.locator('#buka-sorotan')).toHaveAttribute(
    'href',
    /\/peta\/\?tema=Kebencanaan&ind=podes_peringatan_tsunami/,
  );
  // Kecamatan yang perlu perhatian dan sumber data.
  await expect(page.locator('.perhatian__item')).toHaveCount(3);
  await expect(page.locator('.perhatian__item').first().locator('a').last()).toHaveAttribute(
    'href',
    /\/peta\/\?kec=1813\d{3}$/,
  );
  await expect(page.locator('#pita-sumber')).toContainText('Podes');
  // Tidak ada kode wilayah 10 digit (data desa) dan tidak ada sisa templat lama.
  await expect(page.locator('main')).not.toContainText(/\b1813\d{6}\b/);
  await expect(page.locator('body')).not.toContainText(
    /SynerGen|NlexGon|GlobalTech|74[.,]35|116 Pekon|PODES 2024\/2026/,
  );
  await periksaA11yDasar(page);
  expect(galat).toEqual([]);
});

test('beranda: kecamatan di peta sorotan membuka Peta Tematik dengan keyboard', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'navigasi keyboard diuji di desktop');
  await page.goto('/');
  await expect(page.locator('.peta-pesisir a')).toHaveCount(11);
  await page.locator('.peta-pesisir a[data-kode="1813010"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/peta\/\?tema=.+&ind=.+&kec=1813010/);
  await expect(page.locator('#chip-pilihan')).toContainText('Lemong');
});

test('peta tematik: tema -> kartu -> peta -> drill-down kecamatan, hanya agregat', async ({
  page,
  isMobile,
}) => {
  const galat = galatKonsol(page);
  await page.goto('/peta/');
  const kartu = page.locator('.kartu');
  await expect(page.locator('.tab')).toHaveCount(6);
  await expect(page.locator('#kartu-info h2')).toHaveText('Kabupaten Pesisir Barat');
  await expect(page.locator('#kartu-info')).toContainText('121 desa/kelurahan');
  // Satu tema memuat indikator dari sumber berbeda (Dapodik dan Podes).
  await page.locator('.tab', { hasText: 'Pendidikan' }).click();
  await expect(kartu.filter({ hasText: 'Dapodik' }).first()).toBeVisible();
  await expect(kartu.filter({ hasText: 'dari 121 desa' }).first()).toBeVisible();
  await periksaA11yDasar(page);

  // Kartu mewarnai peta; penjelasan indikator dapat dibuka.
  await kartu.filter({ hasText: 'Jumlah Satuan Pendidikan' }).locator('.kartu__utama').click();
  await expect(page.locator('.kartu--aktif')).toContainText('364');
  await expect(page).toHaveURL(/ind=jumlah_sekolah/);
  await page.locator('.kartu--aktif .kartu__info').click();
  await expect(page.locator('.kartu--aktif .kartu__definisi')).toContainText('Sumber:');
  await expect(page.locator('.pil').first()).toBeVisible();

  // Pencarian (Ctrl K di desktop) menemukan indikator di tema lain.
  if (!isMobile) await page.keyboard.press('Control+k');
  await page.locator('#cari-peta-input').fill('tsunami');
  await page.locator('#hasil-cari li[role=option]').first().click();
  await expect(page.locator('.tab[aria-pressed=true]')).toContainText('Kebencanaan');
  await expect(page.locator('.kartu--aktif')).toContainText('dari 84 desa pesisir');

  // Peringkat: 5 teratas, lalu semua 11.
  await expect(page.locator('#daftar-peringkat li')).toHaveCount(5);
  await page.locator('#tombol-semua').click();
  await expect(page.locator('#daftar-peringkat li')).toHaveCount(11);

  // Drill-down: kartu menampilkan angka kecamatan, pembanding kabupaten, dan peringkat.
  await page.locator('.peringkat__baris', { hasText: 'Ngaras' }).click();
  await expect(page.locator('#kartu-info h2')).toHaveText('Ngaras');
  await expect(page.locator('#chip-pilihan')).toContainText('Kec. Ngaras');
  await expect(page).toHaveURL(/kec=1813100/);
  await expect(page.locator('.kartu--aktif')).toContainText('Kab.');
  await expect(page.locator('.kartu--aktif')).toContainText('Peringkat');
  await page.locator('#chip-pilihan button').click();
  await expect(page.locator('#kartu-info h2')).toHaveText('Kabupaten Pesisir Barat');

  // Ketentuan Podes: tidak ada kode desa 10 digit di halaman.
  expect(await page.locator('main').innerText()).not.toMatch(/\b1813\d{6}\b/);
  expect(galat).toEqual([]);
});

test('menu utama: Peta Tematik dan Ruang Belajar; alamat lama Potret Desa dialihkan', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  if (isMobile) await page.locator('.kepala__menu').click();
  const nav = page.locator('#nav-utama');
  await expect(nav.getByRole('link', { name: 'Peta Tematik' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Ruang Belajar' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Data Sekolah' })).toHaveCount(0);
  await page.goto('/podes/');
  await expect(page).toHaveURL(/\/peta\/(\?|$)/);
});

test('profil kecamatan menampilkan semua indikator per tema', async ({ page }) => {
  await page.goto('/kecamatan/?kode=1813030');
  await expect(page.locator('#j-ind')).toHaveText('Profil lintas tema');
  await expect(page.locator('.baris-kelompok', { hasText: 'Wilayah' })).toBeVisible();
  await expect(page.locator('.baris-kelompok', { hasText: 'Pendidikan' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Desa pesisir', exact: true })).toHaveAttribute(
    'href',
    '/peta/?ind=podes_pesisir&kec=1813030',
  );
});

test('profil kecamatan: ringkasan pimpinan dan kalimat penjelasan indikator', async ({ page }) => {
  await page.goto('/kecamatan/?kode=1813090');
  await expect(page.locator('#j-ringkasan')).toContainText('Ngambur');
  await expect(page.locator('.ringkasan__kolom--baik li').first()).toBeVisible();
  // "Ada SD/MI" dijelaskan dengan kalimat lengkap, bukan hanya nama singkat.
  await expect(
    page.locator('.narasi-baris', { hasText: 'memiliki sedikitnya satu SD atau MI' }),
  ).toBeVisible();
  // Peserta didik dan guru tidak ditayangkan.
  await expect(page.locator('#j-rekap').locator('..')).not.toContainText('Peserta didik');
  await expect(page.getByRole('button', { name: 'Cetak / simpan PDF' })).toBeVisible();
});

test('tabel dinamis: indikator per kecamatan dan tabulasi silang sekolah', async ({ page }) => {
  await page.goto('/tabel/');
  await expect(page.locator('.tabel-dinamis tbody tr')).toHaveCount(11);
  await page.selectOption('#t-tema', 'Infrastruktur');
  await page.locator('.daftar-centang label', { hasText: 'Jalan antardesa beraspal' }).click();
  await expect(page).toHaveURL(/ind=[^&]*podes_jalan_aspal/);
  await expect(page.locator('.tabel-dinamis thead')).toContainText('Jalan antardesa beraspal');
  await page.getByRole('button', { name: 'Tabulasi silang sekolah' }).click();
  await page.selectOption('#s-baris', 'jenjang');
  await page.selectOption('#s-kolom', 'status');
  await expect(page.locator('.tabel-dinamis tfoot')).toContainText('364');
  await expect(page).toHaveURL(/mode=sekolah&baris=jenjang&kolom=status/);
  await periksaA11yDasar(page);
});

test('data sekolah: saring, URL dapat dibagikan, profil', async ({ page }) => {
  await page.goto('/sekolah/');
  await expect(page.locator('#ringkas-hasil')).toContainText('dari 364 sekolah');
  await expect(page.locator('#rekap-jenjang button')).toHaveCount(6);
  await expect(page.locator('thead')).not.toContainText('Peserta didik');
  await page.selectOption('#f-kec', '1813030');
  await expect(page).toHaveURL(/kec=1813030/);
  await expect(page.locator('#ringkas-hasil')).toContainText('dari 5 sekolah');
  await page.fill('#f-q', 'zzzz-tidak-ada');
  await expect(page.locator('.keadaan')).toContainText('Tidak ada sekolah yang cocok');
  await page.getByRole('button', { name: 'Hapus saringan' }).first().click();
  await expect(page.locator('#ringkas-hasil')).toContainText('dari 364 sekolah');
  await page.locator('tbody a').first().click();
  await expect(page.locator('h1')).not.toHaveText('');
  await expect(page.locator('.profil-kepala')).toContainText('NPSN');
  // Peserta didik dan guru belum lengkap di sumber: tidak ditayangkan.
  await expect(page.locator('.kpi')).toHaveCount(0);
  await periksaA11yDasar(page);
});

test('layanan data (K03): permohonan tersimpan, tiket tampil, status dapat dicek', async ({
  page,
}) => {
  await page.goto('/layanan/');
  await page.getByRole('button', { name: 'Kirim permohonan' }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await page.fill('#p-nama', 'Penguji Otomatis');
  await page.fill('#p-email', 'penguji@contoh.id');
  await page.fill(
    '#p-pesan',
    'Mohon data jumlah sekolah per kecamatan tahun 2026 untuk uji otomatis.',
  );
  await page.check('input[name="setuju_privasi"]');
  await page.getByRole('button', { name: 'Kirim permohonan' }).click();
  await expect(page.locator('#konfirmasi')).toContainText('Permohonan tersimpan');
  const tiket = (await page.locator('.tiket').textContent())?.trim() ?? '';
  expect(tiket).toMatch(/^PST-\d{8}-[A-Z0-9]{5}$/);
  await page.getByRole('button', { name: 'Cek status' }).click();
  await expect(page.locator('#hasil-status')).toContainText('Diterima, menunggu ditangani');
});

test('verifikasi sertifikat: kode tidak terdaftar ditolak dengan jelas', async ({ page }) => {
  await page.goto('/sertifikat/?kode=ABCDEFGHJK');
  await expect(page.locator('#hasil-verifikasi')).toContainText('Sertifikat tidak terdaftar');
});

test('halaman privasi, tentang, dan 404 tersedia', async ({ page }) => {
  await page.goto('/privasi/');
  await expect(page.locator('h1')).toHaveText('Kebijakan privasi');
  await expect(page.locator('main')).toContainText('27 Tahun 2022');
  await page.goto('/tentang/');
  await periksaA11yDasar(page);
  const res = await page.goto('/halaman-yang-tidak-ada/');
  expect(res?.status()).toBeLessThan(500);
});
