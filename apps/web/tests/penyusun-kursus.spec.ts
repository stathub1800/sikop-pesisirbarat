/**
 * E2E penyusun kursus (Fase 3): admin menambah bab, pelajaran tiap jenis, mengurutkan dengan tombol,
 * pratinjau sebagai peserta, lalu menerbitkan. Bab uji dihapus di akhir agar kursus seed bersih.
 * Hanya proyek desktop (penyusun adalah alat kerja admin). Butuh API lokal dengan DEV_LOGIN=aktif.
 */
import { expect, test } from '@playwright/test';

const ADMIN = process.env.SIKOP_ADMIN ?? 'admin@contoh.go.id';
const KURSUS = process.env.SIKOP_KURSUS ?? 'uji';
const unik = Date.now().toString(36);
const JUDUL_BAB = `Bab uji ${unik}`;

test('admin menyusun bab dan pelajaran, pratinjau, lalu menerbitkan', async ({ page }) => {
  const r = await page.request.post('/api/v1/auth/dev', {
    headers: { 'X-SIKOP': '1' },
    data: { email: ADMIN, nama: 'admin' },
  });
  expect(r.ok(), await r.text()).toBeTruthy();

  await page.goto(`/admin/#/penyusun/${KURSUS}`);
  await expect(page.getByRole('heading', { name: 'Kesiapan terbit' })).toBeVisible();

  // Bab baru (draf).
  await page.getByRole('link', { name: 'Tambah bab' }).click();
  await page.getByLabel('Judul bab').fill(JUDUL_BAB);
  await page.getByRole('button', { name: 'Tambah bab' }).click();
  const bab = page.locator('.susun-bab', { hasText: JUDUL_BAB });
  await expect(bab).toBeVisible();
  await expect(bab.getByText('Draf').first()).toBeVisible();

  // Video: tautan YouTube biasa dinormalkan.
  await bab.getByRole('link', { name: '+ Video' }).click();
  await page.getByLabel('Judul pelajaran').fill('Video pembuka');
  await page.getByLabel('Tautan video YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByLabel('Tautan video YouTube').blur();
  await expect(page.getByLabel('Tautan video YouTube')).toHaveValue(
    /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  );
  await page.getByRole('button', { name: 'Tambah pelajaran' }).click();
  await expect(bab.getByText('Video pembuka')).toBeVisible();

  // Tautan video tidak valid ditolak.
  await bab.getByRole('link', { name: '+ Video' }).click();
  await page.getByLabel('Judul pelajaran').fill('Video salah');
  await page.getByLabel('Tautan video YouTube').fill('https://contoh.com/bukan-video');
  await page.getByRole('button', { name: 'Tambah pelajaran' }).click();
  await expect(page.getByRole('heading', { name: /Pelajaran baru/ })).toBeVisible();
  await page.getByRole('link', { name: 'Kembali' }).click();

  // Bacaan Markdown dengan pratinjau langsung.
  await bab.getByRole('link', { name: '+ Bacaan' }).click();
  await page.getByLabel('Judul pelajaran').fill('Bacaan inti');
  await page.getByLabel('Isi bacaan (Markdown)').fill('# Judul Besar\n\n- satu\n- dua');
  await expect(page.locator('.susun-pratinjau h1, .susun-pratinjau h2')).toContainText(
    'Judul Besar',
  );
  await expect(page.locator('.susun-pratinjau li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Tambah pelajaran' }).click();
  await expect(bab.getByText('Bacaan inti')).toBeVisible();

  // Urutan: turunkan pelajaran pertama.
  const nama = bab.locator('.susun-pelajaran__nama a');
  await expect(nama).toHaveText(['Video pembuka', 'Bacaan inti']);
  await bab.getByRole('button', { name: 'Turunkan Video pembuka' }).click();
  await expect(nama).toHaveText(['Bacaan inti', 'Video pembuka']);

  // Pratinjau sebagai peserta (draf tetap dapat dilihat admin).
  await bab.getByRole('link', { name: 'Pratinjau' }).first().click();
  await expect(page.getByRole('heading', { name: 'Judul Besar' })).toBeVisible();
  await page.goBack();

  // Terbitkan bab dan kedua pelajaran.
  await bab.getByRole('button', { name: 'Terbitkan Bacaan inti' }).click();
  await expect(bab.getByRole('button', { name: 'Jadikan draf Bacaan inti' })).toBeVisible();
  await bab.getByRole('button', { name: 'Terbitkan bab ' + JUDUL_BAB }).click();
  await expect(bab.getByRole('button', { name: 'Jadikan draf bab ' + JUDUL_BAB })).toBeVisible();

  // Riwayat perubahan mencatat aksi.
  await expect(page.getByRole('heading', { name: 'Riwayat perubahan' })).toBeVisible();
  await expect(page.locator('table').last().locator('tbody tr').first()).toBeVisible();

  // Pembersihan: hapus bab uji (tanpa progres peserta).
  await bab.getByRole('button', { name: 'Hapus bab ' + JUDUL_BAB }).click();
  await page.getByRole('button', { name: 'Hapus', exact: true }).last().click();
  await expect(page.locator('.susun-bab', { hasText: JUDUL_BAB })).toHaveCount(0);
});
