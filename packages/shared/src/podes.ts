/**
 * Indikator Potret Desa dari Podes (Pemutakhiran Data Perkembangan Desa) BPS.
 *
 * Ketentuan: data Podes hanya boleh ditampilkan sebagai AGREGAT sampai tingkat KECAMATAN.
 * Modul ini menerima baris per desa (hanya di komputer pengolah, tidak pernah di-commit atau
 * dikirim ke Worker) dan hanya mengeluarkan angka per kecamatan dan kabupaten.
 *
 * Setiap indikator berbentuk salah satu dari:
 *  - persen : 100 x jumlah pembilang / jumlah penyebut. Pembilang dan penyebut per desa bernilai
 *             0/1 (jumlah desa) atau jumlah keluarga. Agregat kabupaten = rasio dari jumlah.
 *  - median : median nilai per desa (misal jarak ke fasilitas terdekat) di antara desa yang relevan.
 */

export type BarisDesa = Record<string, unknown>;
export type ArahPodes = 'naik_baik' | 'turun_baik' | 'netral';

export const TEMA_PODES = [
  'Wilayah',
  'Infrastruktur',
  'Pendidikan',
  'Kesehatan',
  'Kebencanaan',
  'Ekonomi',
  'Tata kelola dan sosial',
] as const;
export type TemaPodes = (typeof TEMA_PODES)[number];

interface Dasar {
  id: string;
  nama: string;
  tema: TemaPodes;
  /** Rujukan pertanyaan kuesioner PODES-DESA, mis. "R904d". */
  rujukan: string;
  /** Penjelasan cara hitung dalam bahasa awam (tayang sebagai "cara hitung"). */
  definisi: string;
  arah: ArahPodes;
}
export interface IndikatorPodesPersen extends Dasar {
  jenis: 'persen';
  /** Satuan penyebut untuk teks "x dari y ...", mis. "desa", "desa pesisir", "keluarga". */
  unit: string;
  pembilang: (r: BarisDesa) => number;
  penyebut: (r: BarisDesa) => number;
}
export interface IndikatorPodesMedian extends Dasar {
  jenis: 'median';
  satuan: 'km' | 'menit';
  /** Nilai per desa; null bila desa tidak relevan (mis. sudah memiliki fasilitas). */
  nilai: (r: BarisDesa) => number | null;
}
export type IndikatorPodes = IndikatorPodesPersen | IndikatorPodesMedian;

/* ------------------------------ Pembantu baca kolom ------------------------------ */

const n = (r: BarisDesa, k: string): number => {
  const v = r[k];
  const x = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(x) ? x : 0;
};
const s = (r: BarisDesa, k: string): string => String(r[k] ?? '').trim();
const sama =
  (k: string, ...nilai: number[]) =>
  (r: BarisDesa) =>
    nilai.includes(n(r, k)) ? 1 : 0;
const ada =
  (...kolom: string[]) =>
  (r: BarisDesa) =>
    kolom.reduce((a, k) => a + n(r, k), 0) > 0 ? 1 : 0;
const semuaDesa = (): number => 1;
/** Pertanyaan blok XII hanya untuk desa/UPT/nagari, bukan kelurahan (R301 = 2). */
const bukanKelurahan = (r: BarisDesa): number => (n(r, 'R301') === 2 ? 0 : 1);
const pesisir = sama('R302A', 1);

/** Isian jarak 99,7 (atau lebih) adalah penanda di berkas Podes, bukan jarak sebenarnya. */
export const jarakSah = (v: number): boolean => v > 0 && v < 99;
const jarakMin =
  (...kolom: string[]) =>
  (r: BarisDesa) => {
    const sah = kolom.map((k) => n(r, k)).filter(jarakSah);
    return sah.length ? Math.min(...sah) : null;
  };
const hurufBencana = 'ABCDEFGHIJK'.split('');
const hurufIklim = 'ABCDEF'.split('');

const persen = (
  d: Omit<IndikatorPodesPersen, 'jenis' | 'unit' | 'penyebut'> &
    Partial<Pick<IndikatorPodesPersen, 'unit' | 'penyebut'>>,
): IndikatorPodesPersen => ({ jenis: 'persen', unit: 'desa', penyebut: semuaDesa, ...d });

/* ------------------------------ Daftar indikator ------------------------------ */

export const INDIKATOR_PODES: readonly IndikatorPodes[] = [
  // Wilayah
  persen({
    id: 'podes_pesisir',
    nama: 'Desa/kelurahan pesisir',
    tema: 'Wilayah',
    rujukan: 'R302a',
    definisi: 'Persentase desa/kelurahan yang wilayahnya berbatasan langsung dengan laut.',
    arah: 'netral',
    pembilang: pesisir,
  }),
  persen({
    id: 'podes_hutan',
    nama: 'Desa/kelurahan di dalam atau tepi kawasan hutan',
    tema: 'Wilayah',
    rujukan: 'R303a',
    definisi: 'Persentase desa/kelurahan yang berada di dalam atau di tepi/sekitar kawasan hutan.',
    arah: 'netral',
    pembilang: sama('R303A', 1, 2),
  }),
  persen({
    id: 'podes_perkotaan',
    nama: 'Desa/kelurahan berstatus perkotaan',
    tema: 'Wilayah',
    rujukan: 'R105',
    definisi: 'Persentase desa/kelurahan dengan status daerah perkotaan.',
    arah: 'netral',
    pembilang: sama('R105', 1),
  }),
  persen({
    id: 'podes_pertanian',
    nama: 'Desa/kelurahan dengan penghasilan utama dari pertanian',
    tema: 'Wilayah',
    rujukan: 'R1008a',
    definisi:
      'Persentase desa/kelurahan yang sumber penghasilan utama sebagian besar penduduknya dari pertanian.',
    arah: 'netral',
    pembilang: sama('R1008A', 1),
  }),

  // Konektivitas
  persen({
    id: 'podes_internet_4g',
    nama: 'Desa/kelurahan dengan sinyal internet 4G',
    tema: 'Infrastruktur',
    rujukan: 'R904d',
    definisi:
      'Persentase desa/kelurahan yang sebagian besar wilayahnya mendapat sinyal internet 4G/LTE atau lebih baik.',
    arah: 'naik_baik',
    pembilang: sama('R904D', 1),
  }),
  persen({
    id: 'podes_sinyal_kuat',
    nama: 'Desa/kelurahan dengan sinyal telepon seluler kuat',
    tema: 'Infrastruktur',
    rujukan: 'R904c',
    definisi:
      'Persentase desa/kelurahan yang sinyal telepon selulernya kuat atau sangat kuat di sebagian besar wilayah.',
    arah: 'naik_baik',
    pembilang: sama('R904C', 1, 2),
  }),
  persen({
    id: 'podes_jalan_aspal',
    nama: 'Desa/kelurahan dengan jalan antardesa beraspal',
    tema: 'Infrastruktur',
    rujukan: 'R901b1',
    definisi:
      'Persentase desa/kelurahan yang permukaan jalan darat antardesa terluasnya aspal atau beton.',
    arah: 'naik_baik',
    pembilang: sama('R901B1', 1),
  }),
  persen({
    id: 'podes_angkutan_umum',
    nama: 'Desa/kelurahan yang dilalui angkutan umum',
    tema: 'Infrastruktur',
    rujukan: 'R901c1',
    definisi:
      'Persentase desa/kelurahan yang dilewati angkutan umum, baik dengan maupun tanpa trayek tetap.',
    arah: 'naik_baik',
    pembilang: (r) => (/[AB]/.test(s(r, 'R901C1')) ? 1 : 0),
  }),
  {
    id: 'podes_waktu_kabupaten',
    nama: 'Waktu tempuh desa ke kantor bupati (median)',
    tema: 'Infrastruktur',
    rujukan: 'R902b',
    definisi:
      'Median waktu tempuh dari kantor kepala desa/lurah ke kantor bupati dengan sarana transportasi yang biasa digunakan penduduk.',
    arah: 'turun_baik',
    jenis: 'median',
    satuan: 'menit',
    nilai: (r) => {
      const m = n(r, 'R902BK6A') * 60 + n(r, 'R902BK6B');
      return m > 0 ? m : null;
    },
  },

  // Pendidikan
  persen({
    id: 'podes_ada_sd',
    nama: 'Desa/kelurahan yang memiliki SD/MI',
    tema: 'Pendidikan',
    rujukan: 'R701c-d',
    definisi: 'Persentase desa/kelurahan yang memiliki SD atau MI, negeri maupun swasta.',
    arah: 'naik_baik',
    pembilang: ada('R701CK2', 'R701CK7', 'R701DK2', 'R701DK7'),
  }),
  persen({
    id: 'podes_ada_smp',
    nama: 'Desa/kelurahan yang memiliki SMP/MTs',
    tema: 'Pendidikan',
    rujukan: 'R701e-f',
    definisi: 'Persentase desa/kelurahan yang memiliki SMP atau MTs, negeri maupun swasta.',
    arah: 'naik_baik',
    pembilang: ada('R701EK2', 'R701EK7', 'R701FK2', 'R701FK7'),
  }),
  persen({
    id: 'podes_ada_sma',
    nama: 'Desa/kelurahan yang memiliki SMA/MA/SMK',
    tema: 'Pendidikan',
    rujukan: 'R701g-i',
    definisi: 'Persentase desa/kelurahan yang memiliki SMA, MA, atau SMK, negeri maupun swasta.',
    arah: 'naik_baik',
    pembilang: ada('R701GK2', 'R701GK7', 'R701HK2', 'R701HK7', 'R701IK2', 'R701IK7'),
  }),
  {
    id: 'podes_jarak_sma',
    nama: 'Jarak desa tanpa SMA/MA/SMK ke sekolah terdekat (median)',
    tema: 'Pendidikan',
    rujukan: 'R701g-i kolom 4',
    definisi:
      'Median jarak (km) ke SMA, MA, atau SMK terdekat, dihitung hanya untuk desa yang belum memiliki ketiganya.',
    arah: 'turun_baik',
    jenis: 'median',
    satuan: 'km',
    nilai: (r) =>
      ada('R701GK2', 'R701GK7', 'R701HK2', 'R701HK7', 'R701IK2', 'R701IK7')(r)
        ? null
        : jarakMin('R701GK12', 'R701HK12', 'R701IK12')(r),
  },
  persen({
    id: 'podes_tbm',
    nama: 'Desa/kelurahan yang memiliki taman bacaan atau perpustakaan',
    tema: 'Pendidikan',
    rujukan: 'R702',
    definisi:
      'Persentase desa/kelurahan yang memiliki taman bacaan masyarakat atau perpustakaan desa.',
    arah: 'naik_baik',
    pembilang: sama('R702', 1),
  }),

  // Kesehatan
  persen({
    id: 'podes_faskes_dasar',
    nama: 'Desa/kelurahan yang memiliki fasilitas kesehatan dasar',
    tema: 'Kesehatan',
    rujukan: 'R704d-f, j-k',
    definisi:
      'Persentase desa/kelurahan yang memiliki puskesmas, puskesmas pembantu, poskesdes, atau polindes.',
    arah: 'naik_baik',
    pembilang: ada('R704DK2', 'R704EK2', 'R704FK2', 'R704JK2', 'R704KK2'),
  }),
  persen({
    id: 'podes_bidan',
    nama: 'Desa/kelurahan yang memiliki praktik mandiri bidan',
    tema: 'Kesehatan',
    rujukan: 'R704i',
    definisi: 'Persentase desa/kelurahan yang memiliki praktik mandiri bidan.',
    arah: 'naik_baik',
    pembilang: ada('R704IK2'),
  }),
  persen({
    id: 'podes_dokter',
    nama: 'Desa/kelurahan yang memiliki praktik mandiri dokter',
    tema: 'Kesehatan',
    rujukan: 'R704h',
    definisi: 'Persentase desa/kelurahan yang memiliki praktik mandiri dokter.',
    arah: 'naik_baik',
    pembilang: ada('R704HK2'),
  }),
  persen({
    id: 'podes_posyandu',
    nama: 'Desa/kelurahan dengan posyandu aktif setiap bulan',
    tema: 'Kesehatan',
    rujukan: 'R705a',
    definisi: 'Persentase desa/kelurahan yang memiliki posyandu dengan kegiatan setiap bulan.',
    arah: 'naik_baik',
    pembilang: ada('R705A'),
  }),
  {
    id: 'podes_jarak_puskesmas',
    nama: 'Jarak desa tanpa puskesmas ke puskesmas terdekat (median)',
    tema: 'Kesehatan',
    rujukan: 'R704d-e kolom 3',
    definisi:
      'Median jarak (km) ke puskesmas terdekat (rawat inap maupun tidak), dihitung hanya untuk desa yang belum memiliki puskesmas.',
    arah: 'turun_baik',
    jenis: 'median',
    satuan: 'km',
    nilai: (r) => (ada('R704DK2', 'R704EK2')(r) ? null : jarakMin('R704DK7', 'R704EK7')(r)),
  },

  // Perumahan dan lingkungan
  persen({
    id: 'podes_tanpa_listrik',
    nama: 'Keluarga tanpa listrik',
    tema: 'Infrastruktur',
    rujukan: 'R501',
    definisi:
      'Persentase keluarga bukan pengguna listrik (PLN maupun non-PLN) terhadap seluruh keluarga.',
    arah: 'turun_baik',
    unit: 'keluarga',
    pembilang: (r) => n(r, 'R501B'),
    penyebut: (r) => n(r, 'R501A1') + n(r, 'R501A2') + n(r, 'R501B'),
  }),
  persen({
    id: 'podes_septik',
    nama: 'Desa/kelurahan yang mayoritas keluarganya memakai tangki septik',
    tema: 'Infrastruktur',
    rujukan: 'R505',
    definisi:
      'Persentase desa/kelurahan yang sebagian besar keluarganya membuang tinja ke tangki septik atau IPAL.',
    arah: 'naik_baik',
    pembilang: sama('R505', 1),
  }),
  persen({
    id: 'podes_air_sungai',
    nama: 'Desa/kelurahan yang mayoritas keluarganya minum air sungai atau danau',
    tema: 'Infrastruktur',
    rujukan: 'R504',
    definisi:
      'Persentase desa/kelurahan yang sebagian besar keluarganya minum dari sungai, danau, kolam, atau waduk.',
    arah: 'turun_baik',
    pembilang: sama('R504', 8),
  }),
  persen({
    id: 'podes_kayu_bakar',
    nama: 'Desa/kelurahan yang mayoritas keluarganya memasak dengan kayu bakar',
    tema: 'Infrastruktur',
    rujukan: 'R503',
    definisi:
      'Persentase desa/kelurahan yang sebagian besar keluarganya memasak dengan kayu bakar.',
    arah: 'turun_baik',
    pembilang: sama('R503', 10),
  }),
  persen({
    id: 'podes_energi_terbarukan',
    nama: 'Desa/kelurahan yang memanfaatkan energi terbarukan',
    tema: 'Infrastruktur',
    rujukan: 'R509e',
    definisi:
      'Persentase desa/kelurahan dengan kegiatan pemanfaatan energi baru terbarukan (surya, angin, mikrohidro, biogas, dan sejenisnya) setahun terakhir.',
    arah: 'naik_baik',
    pembilang: sama('R509E', 1, 2),
  }),

  // Bencana dan mitigasi
  persen({
    id: 'podes_bencana',
    nama: 'Desa/kelurahan yang mengalami bencana alam',
    tema: 'Kebencanaan',
    rujukan: 'R601',
    definisi:
      'Persentase desa/kelurahan yang mengalami sedikitnya satu jenis bencana alam pada periode rujukan kuesioner.',
    arah: 'turun_baik',
    pembilang: (r) => (hurufBencana.some((h) => n(r, `R601${h}K2`) === 1) ? 1 : 0),
  }),
  persen({
    id: 'podes_peringatan_dini',
    nama: 'Desa/kelurahan yang memiliki sistem peringatan dini bencana',
    tema: 'Kebencanaan',
    rujukan: 'R602a',
    definisi: 'Persentase desa/kelurahan yang memiliki sistem peringatan dini bencana alam.',
    arah: 'naik_baik',
    pembilang: sama('R602A', 1),
  }),
  persen({
    id: 'podes_peringatan_tsunami',
    nama: 'Desa pesisir yang memiliki sistem peringatan dini tsunami',
    tema: 'Kebencanaan',
    rujukan: 'R602b',
    definisi:
      'Persentase desa pesisir yang memiliki sistem peringatan dini khusus tsunami. Penyebutnya hanya desa yang berbatasan dengan laut.',
    arah: 'naik_baik',
    unit: 'desa pesisir',
    pembilang: (r) => (pesisir(r) && n(r, 'R602B') === 1 ? 1 : 0),
    penyebut: pesisir,
  }),
  persen({
    id: 'podes_jalur_evakuasi',
    nama: 'Desa/kelurahan yang memiliki rambu dan jalur evakuasi',
    tema: 'Kebencanaan',
    rujukan: 'R602d',
    definisi: 'Persentase desa/kelurahan yang memiliki rambu dan jalur evakuasi bencana.',
    arah: 'naik_baik',
    pembilang: sama('R602D', 1),
  }),
  persen({
    id: 'podes_dampak_iklim',
    nama: 'Desa/kelurahan yang terdampak perubahan iklim',
    tema: 'Kebencanaan',
    rujukan: 'R604',
    definisi:
      'Persentase desa/kelurahan yang penduduknya merasakan sedikitnya satu dampak perubahan iklim dalam lima tahun terakhir (kelangkaan air, sulit bertani atau melaut, gagal panen, dan lainnya).',
    arah: 'turun_baik',
    pembilang: (r) => (hurufIklim.some((h) => [1, 2].includes(n(r, `R604${h}`))) ? 1 : 0),
  }),

  // Ekonomi
  persen({
    id: 'podes_bank',
    nama: 'Desa/kelurahan yang memiliki kantor bank',
    tema: 'Ekonomi',
    rujukan: 'R1002a',
    definisi: 'Persentase desa/kelurahan yang memiliki kantor bank umum atau BPR yang beroperasi.',
    arah: 'naik_baik',
    pembilang: ada('R1002A1', 'R1002A2', 'R1002A3', 'R1002A4', 'R1002A5', 'R1002A6'),
  }),
  persen({
    id: 'podes_agen_bank',
    nama: 'Desa/kelurahan yang memiliki agen bank',
    tema: 'Ekonomi',
    rujukan: 'R1003',
    definisi:
      'Persentase desa/kelurahan yang memiliki layanan atau agen bank tanpa kantor (Laku Pandai, BRILink, Agen46, dan sejenisnya).',
    arah: 'naik_baik',
    pembilang: sama('R1003', 1),
  }),
  {
    id: 'podes_jarak_bank',
    nama: 'Jarak desa tanpa kantor bank ke bank terdekat (median)',
    tema: 'Ekonomi',
    rujukan: 'R1002b',
    definisi:
      'Median perkiraan jarak (km) ke bank terdekat, dihitung hanya untuk desa yang belum memiliki kantor bank.',
    arah: 'turun_baik',
    jenis: 'median',
    satuan: 'km',
    nilai: (r) =>
      ada('R1002A1', 'R1002A2', 'R1002A3', 'R1002A4', 'R1002A5', 'R1002A6')(r) ||
      !jarakSah(n(r, 'R1002B'))
        ? null
        : n(r, 'R1002B'),
  },
  persen({
    id: 'podes_kur',
    nama: 'Desa/kelurahan dengan penerima Kredit Usaha Rakyat (KUR)',
    tema: 'Ekonomi',
    rujukan: 'R1006a',
    definisi:
      'Persentase desa/kelurahan yang warganya menerima Kredit Usaha Rakyat dalam setahun terakhir.',
    arah: 'naik_baik',
    pembilang: sama('R1006A', 1),
  }),
  persen({
    id: 'podes_pasar',
    nama: 'Desa/kelurahan yang memiliki pasar',
    tema: 'Ekonomi',
    rujukan: 'R1007b-d',
    definisi:
      'Persentase desa/kelurahan yang memiliki pasar, baik bangunan permanen, semi permanen, maupun tanpa bangunan.',
    arah: 'naik_baik',
    pembilang: ada('R1007BK2', 'R1007CK2', 'R1007DK2'),
  }),
  persen({
    id: 'podes_minimarket',
    nama: 'Desa/kelurahan yang memiliki minimarket',
    tema: 'Ekonomi',
    rujukan: 'R1007e',
    definisi: 'Persentase desa/kelurahan yang memiliki minimarket, swalayan, atau supermarket.',
    arah: 'netral',
    pembilang: ada('R1007EK2'),
  }),
  persen({
    id: 'podes_akomodasi',
    nama: 'Desa/kelurahan yang memiliki hotel atau penginapan',
    tema: 'Ekonomi',
    rujukan: 'R1007h-i',
    definisi: 'Persentase desa/kelurahan yang memiliki hotel atau penginapan.',
    arah: 'netral',
    pembilang: ada('R1007HK2', 'R1007IK2'),
  }),
  persen({
    id: 'podes_produk_unggulan',
    nama: 'Desa/kelurahan yang memiliki produk unggulan',
    tema: 'Ekonomi',
    rujukan: 'R1010a',
    definisi: 'Persentase desa/kelurahan yang memiliki produk barang unggulan.',
    arah: 'naik_baik',
    pembilang: sama('R1010A', 1),
  }),

  // Tata kelola desa (blok XII hanya untuk desa, bukan kelurahan)
  persen({
    id: 'podes_sid',
    nama: 'Desa dengan sistem informasi desa yang mutakhir',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1201a',
    definisi:
      'Persentase desa (tidak termasuk kelurahan) yang memiliki sistem informasi desa dan memperbaruinya.',
    arah: 'naik_baik',
    unit: 'desa',
    pembilang: (r) => (bukanKelurahan(r) && n(r, 'R1201A') === 1 ? 1 : 0),
    penyebut: bukanKelurahan,
  }),
  persen({
    id: 'podes_siskeudes',
    nama: 'Desa dengan sistem keuangan desa yang mutakhir',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1201c',
    definisi:
      'Persentase desa (tidak termasuk kelurahan) yang menggunakan sistem keuangan desa dan memperbaruinya.',
    arah: 'naik_baik',
    unit: 'desa',
    pembilang: (r) => (bukanKelurahan(r) && n(r, 'R1201C') === 1 ? 1 : 0),
    penyebut: bukanKelurahan,
  }),
  persen({
    id: 'podes_bumdes',
    nama: 'Desa yang memiliki unit usaha BUMDes',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1202a',
    definisi:
      'Persentase desa (tidak termasuk kelurahan) yang memiliki sedikitnya satu unit usaha BUMDes.',
    arah: 'naik_baik',
    unit: 'desa',
    pembilang: (r) => (bukanKelurahan(r) && n(r, 'R1202A') > 0 ? 1 : 0),
    penyebut: bukanKelurahan,
  }),
  persen({
    id: 'podes_perdes_pug',
    nama: 'Desa dengan peraturan desa tentang gender atau perlindungan anak',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1203b',
    definisi:
      'Persentase desa (tidak termasuk kelurahan) yang memiliki peraturan desa tentang pengarusutamaan gender atau perlindungan anak.',
    arah: 'naik_baik',
    unit: 'desa',
    pembilang: (r) => (bukanKelurahan(r) && n(r, 'R1203B') === 1 ? 1 : 0),
    penyebut: bukanKelurahan,
  }),
  persen({
    id: 'podes_apbdes_ppa',
    nama: 'Desa yang mengalokasikan APBDes untuk perempuan dan anak',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1204a',
    definisi:
      'Persentase desa (tidak termasuk kelurahan) yang mengalokasikan APBDes tahun berjalan untuk pemberdayaan perempuan dan perlindungan anak.',
    arah: 'naik_baik',
    unit: 'desa',
    pembilang: (r) => (bukanKelurahan(r) && n(r, 'R1204A') === 1 ? 1 : 0),
    penyebut: bukanKelurahan,
  }),
  persen({
    id: 'podes_bpd_perempuan',
    nama: 'Desa/kelurahan yang BPD-nya beranggota perempuan',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1403b',
    definisi:
      'Persentase desa/kelurahan yang memiliki BPD atau LMK dengan sedikitnya satu anggota perempuan, di antara yang memiliki BPD/LMK.',
    arah: 'naik_baik',
    pembilang: (r) => (n(r, 'R1403A') === 1 && n(r, 'R1403B') === 1 ? 1 : 0),
    penyebut: sama('R1403A', 1),
  }),

  // Sosial dan keamanan (kejadian kekerasan, perkelahian, dan judi online sengaja tidak ditayangkan)
  persen({
    id: 'podes_lapangan_olahraga',
    nama: 'Desa/kelurahan yang memiliki lapangan olahraga',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R802',
    definisi: 'Persentase desa/kelurahan yang memiliki lapangan olahraga.',
    arah: 'naik_baik',
    pembilang: sama('R802', 1),
  }),
  persen({
    id: 'podes_ruang_publik',
    nama: 'Desa/kelurahan yang memiliki ruang publik terbuka',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R803',
    definisi: 'Persentase desa/kelurahan yang memiliki ruang publik terbuka.',
    arah: 'naik_baik',
    pembilang: sama('R803', 1),
  }),
  persen({
    id: 'podes_seni_budaya',
    nama: 'Desa/kelurahan dengan kegiatan seni budaya dan olahraga',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R804',
    definisi:
      'Persentase desa/kelurahan yang mengadakan kegiatan seni budaya dan olahraga setahun terakhir.',
    arah: 'naik_baik',
    pembilang: sama('R804', 1),
  }),
  persen({
    id: 'podes_siskamling',
    nama: 'Desa/kelurahan dengan keamanan lingkungan atas inisiatif warga',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1103e',
    definisi:
      'Persentase desa/kelurahan yang mengaktifkan sistem keamanan lingkungan atas inisiatif warga setahun terakhir.',
    arah: 'naik_baik',
    pembilang: sama('R1103E', 1),
  }),
  persen({
    id: 'podes_layanan_pengaduan',
    nama: 'Desa/kelurahan yang memiliki layanan pengaduan korban kekerasan',
    tema: 'Tata kelola dan sosial',
    rujukan: 'R1107',
    definisi:
      'Persentase desa/kelurahan yang memiliki layanan atau mekanisme pengaduan dan rujukan bagi korban kekerasan.',
    arah: 'naik_baik',
    pembilang: sama('R1107', 1),
  }),
];

export const indikatorPodesById = new Map(INDIKATOR_PODES.map((i) => [i.id, i]));
export const satuanPodes = (i: IndikatorPodes): string => (i.jenis === 'persen' ? '%' : i.satuan);

/* ------------------------------ Agregasi ------------------------------ */

export interface BarisAgregatPodes {
  indikator_id: string;
  /** Kode BPS 7 digit kecamatan, atau 4 digit kabupaten untuk total. */
  kode_wilayah: string;
  /** Persen: jumlah pembilang. Median: null. */
  pembilang: number | null;
  /** Persen: jumlah penyebut. Median: banyaknya desa yang dihitung. */
  penyebut: number;
  nilai: number | null;
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = (v.length - 1) / 2;
  return ((v[Math.floor(m)] as number) + (v[Math.ceil(m)] as number)) / 2;
}
const bulat = (x: number, d = 1): number => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Mengubah baris per desa menjadi agregat kecamatan dan kabupaten.
 * Kode desa diambil dari kolom IDDESA (10 digit): 4 digit kabupaten, 3 digit kecamatan, 3 digit desa.
 * Keluaran tidak pernah memuat kode atau nama desa.
 */
export function agregatPodes(
  desa: readonly BarisDesa[],
  kodeKab: string,
  indikator: readonly IndikatorPodes[] = INDIKATOR_PODES,
): BarisAgregatPodes[] {
  const milikKab = desa.filter((r) => s(r, 'IDDESA').startsWith(kodeKab));
  if (!milikKab.length) throw new Error(`Tidak ada desa berkode ${kodeKab} pada data Podes.`);
  const kelompok = new Map<string, BarisDesa[]>();
  for (const r of milikKab) {
    const kec = s(r, 'IDDESA').slice(0, 7);
    if (!/^\d{7}$/.test(kec)) throw new Error(`IDDESA tidak valid: ${s(r, 'IDDESA')}`);
    kelompok.set(kec, [...(kelompok.get(kec) ?? []), r]);
  }
  const wilayah: [string, BarisDesa[]][] = [
    ...[...kelompok.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [kodeKab, milikKab],
  ];
  const out: BarisAgregatPodes[] = [];
  for (const ind of indikator) {
    for (const [kode, baris] of wilayah) {
      if (ind.jenis === 'persen') {
        const a = baris.reduce((t, r) => t + ind.pembilang(r), 0);
        const b = baris.reduce((t, r) => t + ind.penyebut(r), 0);
        out.push({
          indikator_id: ind.id,
          kode_wilayah: kode,
          pembilang: a,
          penyebut: b,
          nilai: b > 0 ? bulat((100 * a) / b) : null,
        });
      } else {
        const v = baris.map(ind.nilai).filter((x): x is number => x !== null);
        const m = median(v);
        out.push({
          indikator_id: ind.id,
          kode_wilayah: kode,
          pembilang: null,
          penyebut: v.length,
          nilai: m === null ? null : bulat(m),
        });
      }
    }
  }
  return out;
}
