/**
 * Menyusun daftar indikator yang tayang: indikator turunan data sekolah (dihitung saat diminta)
 * dan indikator manual (diisi admin, hanya yang lengkap sumbernya).
 */
import {
  hitungIndikator,
  INDIKATOR_PD_GURU,
  INDIKATOR_SEKOLAH,
  KECAMATAN,
  TAYANG_PD_GURU,
  type SekolahRingkas,
} from '@sikop/shared';
import type { Pengaturan } from '../lib/pengaturan.ts';

export interface IndikatorTayang {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  sumber: string;
  tahun: string;
  metode: string;
  desimal: number;
  arah: string;
  /** "jumlah" (dapat dijumlahkan antarkecamatan), "rasio", atau "tidak_ada". */
  agregasi: string;
  jenis: 'otomatis' | 'manual';
  nilai: Record<string, number | null>;
  kabupaten: number | null;
  diperbarui: string | null;
  /** Hanya indikator berbasis hitungan desa (Podes): pembilang dan penyebut per kecamatan dan kabupaten. */
  rincian?: Record<string, { pembilang: number | null; penyebut: number | null }>;
  rincianKabupaten?: { pembilang: number | null; penyebut: number | null };
  unitPenyebut?: string;
  rujukan?: string;
}

const KODE = KECAMATAN.map((k) => k.kode);

export async function daftarIndikator(
  db: D1Database,
  p: Pengaturan,
  termasukDraf = false,
): Promise<IndikatorTayang[]> {
  const [sekolah, manual, nilai, terakhir] = await db.batch([
    db.prepare(
      `SELECT kode_kec, pd, guru, rombel, akreditasi, akses_internet, sumber_listrik,
              rk_baik, rk_rusak_ringan, rk_rusak_sedang, rk_rusak_berat
         FROM sekolah WHERE is_published = 1`,
    ),
    db.prepare(
      `SELECT id, nama, satuan, kategori, sumber, tahun, metode, desimal, arah, agregasi, kabupaten_nilai, is_published, updated_at,
              unit_penyebut, rujukan, kabupaten_pembilang, kabupaten_penyebut
         FROM indikator ${termasukDraf ? '' : 'WHERE is_published = 1'} ORDER BY urutan, nama`,
    ),
    db.prepare('SELECT indikator_id, kode_kec, nilai, pembilang, penyebut FROM indikator_nilai'),
    db.prepare('SELECT MAX(updated_at) AS t FROM sekolah'),
  ]);

  const rows = (sekolah?.results ?? []) as unknown as SekolahRingkas[];
  const tahunData = (p.tanggal_data_sekolah ?? '').slice(0, 4);
  const diperbarui = (terakhir?.results?.[0] as { t: string | null } | undefined)?.t ?? null;
  // Indikator yang bergantung pada peserta didik/guru disembunyikan dari publik selama datanya belum
  // lengkap (TAYANG_PD_GURU). Admin (termasukDraf) tetap menerimanya.
  const otomatis: IndikatorTayang[] = INDIKATOR_SEKOLAH.filter(
    (ind) => termasukDraf || TAYANG_PD_GURU || !INDIKATOR_PD_GURU.includes(ind.id),
  ).map((ind) => {
    const h = hitungIndikator(ind, rows, KODE);
    return {
      id: ind.id,
      nama: ind.nama,
      satuan: ind.satuan,
      kategori: ind.kategori,
      sumber: p.sumber_data_sekolah ?? 'Data sekolah',
      tahun: tahunData,
      metode: ind.metode,
      desimal: ind.desimal,
      arah: ind.arah,
      agregasi: ind.agregasi,
      jenis: 'otomatis',
      nilai: h.perKecamatan,
      kabupaten: h.kabupaten,
      diperbarui,
    };
  });

  const peta = new Map<string, Record<string, number | null>>();
  const rincian = new Map<
    string,
    Record<string, { pembilang: number | null; penyebut: number | null }>
  >();
  for (const r of (nilai?.results ?? []) as {
    indikator_id: string;
    kode_kec: string;
    nilai: number | null;
    pembilang: number | null;
    penyebut: number | null;
  }[]) {
    const m = peta.get(r.indikator_id) ?? {};
    m[r.kode_kec] = r.nilai;
    peta.set(r.indikator_id, m);
    if (r.penyebut !== null) {
      const d = rincian.get(r.indikator_id) ?? {};
      d[r.kode_kec] = { pembilang: r.pembilang, penyebut: r.penyebut };
      rincian.set(r.indikator_id, d);
    }
  }
  type BarisManual = Omit<IndikatorTayang, 'jenis' | 'nilai' | 'kabupaten' | 'diperbarui'> & {
    agregasi: string;
    kabupaten_nilai: number | null;
    updated_at: string;
    is_published: number;
    unit_penyebut: string | null;
    rujukan: string | null;
    kabupaten_pembilang: number | null;
    kabupaten_penyebut: number | null;
  };
  const manualList: (IndikatorTayang & { is_published?: number })[] = (
    (manual?.results ?? []) as BarisManual[]
  ).map((m) => {
    const v = Object.fromEntries(KODE.map((k) => [k, peta.get(m.id)?.[k] ?? null]));
    const angka = Object.values(v).filter((x): x is number => x !== null);
    // Agregat "jumlah" hanya sah bila semua kecamatan terisi; selain itu pakai nilai kabupaten yang diisi admin.
    const kab =
      m.agregasi === 'jumlah' && angka.length === KODE.length
        ? angka.reduce((a, b) => a + b, 0)
        : m.kabupaten_nilai;
    return {
      id: m.id,
      nama: m.nama,
      satuan: m.satuan,
      kategori: m.kategori,
      sumber: m.sumber ?? '',
      tahun: m.tahun ?? '',
      metode: m.metode ?? '',
      desimal: m.desimal,
      arah: m.arah,
      agregasi: m.agregasi,
      jenis: 'manual',
      nilai: v,
      kabupaten: kab ?? null,
      diperbarui: m.updated_at,
      ...(rincian.has(m.id)
        ? {
            rincian: rincian.get(m.id),
            rincianKabupaten: { pembilang: m.kabupaten_pembilang, penyebut: m.kabupaten_penyebut },
          }
        : {}),
      ...(m.unit_penyebut ? { unitPenyebut: m.unit_penyebut } : {}),
      ...(m.rujukan ? { rujukan: m.rujukan } : {}),
      ...(termasukDraf ? { is_published: m.is_published } : {}),
    };
  });
  return [...otomatis, ...manualList];
}
