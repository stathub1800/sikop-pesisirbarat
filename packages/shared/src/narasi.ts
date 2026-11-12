/**
 * Narasi indikator dalam bahasa awam.
 *
 * Nama indikator seperti "Ada SD/MI" ringkas tetapi dapat disalahpahami (ada di mana? dihitung per apa?).
 * Modul ini menyusun kalimat lengkap dari pembilang dan penyebut yang sudah ada, misalnya:
 *   "Di Kecamatan Ngambur, 9 dari 9 desa/kelurahan (100%) memiliki sedikitnya satu SD atau MI ..."
 * Teks ini tidak menambah data baru; hanya menjelaskan angka agregat kecamatan yang sudah tayang.
 */
import { formatAngka } from './format.ts';

/** Penyebut lengkap untuk teks "x dari y <unit>". */
interface NarasiPersen {
  jenis: 'persen';
  /** Apa yang dimiliki atau dialami unit, mis. "memiliki sedikitnya satu SD atau MI". */
  predikat: string;
  /** Unit penyebut dalam kalimat. Bawaan: "desa/kelurahan". */
  unit?: string;
  /** Unit penyebut versi ringkas untuk label kartu. */
  unitRingkas?: string;
}
interface NarasiMedian {
  jenis: 'median';
  /** Kalimat lengkap; {w} = wilayah, {n} = banyaknya desa yang dihitung, {v} = nilai dengan satuan. */
  templat: string;
}
interface NarasiSekolah {
  jenis: 'sekolah';
  /** Kalimat lengkap; {w} = wilayah, {v} = nilai dengan satuan, {a} = angka tanpa satuan. */
  templat: string;
}
type Narasi = NarasiPersen | NarasiMedian | NarasiSekolah;

const DESA_SAJA = 'desa (tidak termasuk kelurahan)';
const DESA_SAJA_RINGKAS = 'desa, tanpa kelurahan';

export const NARASI_INDIKATOR: Readonly<Record<string, Narasi>> = {
  // Wilayah
  podes_pesisir: { jenis: 'persen', predikat: 'wilayahnya berbatasan langsung dengan laut' },
  podes_hutan: {
    jenis: 'persen',
    predikat: 'berada di dalam atau di tepi kawasan hutan',
  },
  podes_perkotaan: { jenis: 'persen', predikat: 'berstatus daerah perkotaan' },
  podes_pertanian: {
    jenis: 'persen',
    predikat: 'sebagian besar penduduknya berpenghasilan utama dari pertanian',
  },

  // Infrastruktur
  podes_internet_4g: {
    jenis: 'persen',
    predikat: 'sebagian besar wilayahnya sudah menerima sinyal internet 4G/LTE atau lebih baik',
  },
  podes_sinyal_kuat: {
    jenis: 'persen',
    predikat: 'sinyal telepon selulernya kuat atau sangat kuat di sebagian besar wilayah',
  },
  podes_jalan_aspal: {
    jenis: 'persen',
    predikat: 'jalan antardesa terluasnya berpermukaan aspal atau beton',
  },
  podes_angkutan_umum: {
    jenis: 'persen',
    predikat: 'dilalui angkutan umum, dengan maupun tanpa trayek tetap',
  },
  podes_waktu_kabupaten: {
    jenis: 'median',
    templat:
      'Dari {n} desa/kelurahan di {w}, separuhnya dapat mencapai kantor bupati dalam {v} atau kurang dengan sarana transportasi yang biasa dipakai penduduk (nilai tengah atau median).',
  },
  podes_tanpa_listrik: {
    jenis: 'persen',
    predikat: 'belum menggunakan listrik, baik dari PLN maupun non-PLN',
    unit: 'keluarga',
  },
  podes_septik: {
    jenis: 'persen',
    predikat: 'sebagian besar keluarganya membuang tinja ke tangki septik atau IPAL',
  },
  podes_air_sungai: {
    jenis: 'persen',
    predikat:
      'sebagian besar keluarganya mengambil air minum dari sungai, danau, kolam, atau waduk',
  },
  podes_kayu_bakar: {
    jenis: 'persen',
    predikat: 'sebagian besar keluarganya memasak dengan kayu bakar',
  },
  podes_energi_terbarukan: {
    jenis: 'persen',
    predikat:
      'memanfaatkan energi baru terbarukan (misalnya tenaga surya, mikrohidro, atau biogas) dalam setahun terakhir',
  },

  // Pendidikan
  podes_ada_sd: {
    jenis: 'persen',
    predikat:
      'memiliki sedikitnya satu SD atau MI (negeri maupun swasta) di dalam wilayah desanya sendiri',
  },
  podes_ada_smp: {
    jenis: 'persen',
    predikat:
      'memiliki sedikitnya satu SMP atau MTs (negeri maupun swasta) di dalam wilayah desanya sendiri',
  },
  podes_ada_sma: {
    jenis: 'persen',
    predikat:
      'memiliki sedikitnya satu SMA, MA, atau SMK (negeri maupun swasta) di dalam wilayah desanya sendiri',
  },
  podes_jarak_sma: {
    jenis: 'median',
    templat:
      'Ada {n} desa/kelurahan di {w} yang belum memiliki SMA, MA, atau SMK sendiri. Bagi desa-desa itu, jarak tengah (median) ke sekolah tersebut yang terdekat adalah {v}.',
  },
  podes_tbm: {
    jenis: 'persen',
    predikat: 'memiliki taman bacaan masyarakat atau perpustakaan desa',
  },

  // Kesehatan
  podes_faskes_dasar: {
    jenis: 'persen',
    predikat:
      'memiliki sedikitnya satu puskesmas, puskesmas pembantu, poskesdes, atau polindes di dalam wilayahnya',
  },
  podes_bidan: { jenis: 'persen', predikat: 'memiliki tempat praktik mandiri bidan' },
  podes_dokter: { jenis: 'persen', predikat: 'memiliki tempat praktik mandiri dokter' },
  podes_posyandu: {
    jenis: 'persen',
    predikat: 'memiliki posyandu yang berkegiatan setiap bulan',
  },
  podes_jarak_puskesmas: {
    jenis: 'median',
    templat:
      'Ada {n} desa/kelurahan di {w} yang belum memiliki puskesmas sendiri. Bagi desa-desa itu, jarak tengah (median) ke puskesmas terdekat adalah {v}.',
  },

  // Kebencanaan
  podes_bencana: {
    jenis: 'persen',
    predikat:
      'tercatat mengalami sedikitnya satu jenis bencana alam (banjir, gempa, longsor, dan lainnya) pada periode rujukan kuesioner Podes',
  },
  podes_peringatan_dini: {
    jenis: 'persen',
    predikat: 'memiliki sistem peringatan dini bencana alam',
  },
  podes_peringatan_tsunami: {
    jenis: 'persen',
    predikat: 'memiliki sistem peringatan dini khusus tsunami',
    unit: 'desa pesisir (desa yang berbatasan dengan laut)',
    unitRingkas: 'desa pesisir',
  },
  podes_jalur_evakuasi: {
    jenis: 'persen',
    predikat: 'memiliki rambu dan jalur evakuasi bencana',
  },
  podes_dampak_iklim: {
    jenis: 'persen',
    predikat:
      'penduduknya merasakan sedikitnya satu dampak perubahan iklim (misalnya kelangkaan air atau gagal panen) dalam lima tahun terakhir',
  },

  // Ekonomi
  podes_bank: {
    jenis: 'persen',
    predikat: 'memiliki kantor bank umum atau BPR yang beroperasi',
  },
  podes_agen_bank: {
    jenis: 'persen',
    predikat: 'memiliki agen bank tanpa kantor (misalnya BRILink, Agen46, atau Laku Pandai)',
  },
  podes_jarak_bank: {
    jenis: 'median',
    templat:
      'Ada {n} desa/kelurahan di {w} yang belum memiliki kantor bank. Bagi desa-desa itu, perkiraan jarak tengah (median) ke bank terdekat adalah {v}.',
  },
  podes_kur: {
    jenis: 'persen',
    predikat: 'warganya menerima Kredit Usaha Rakyat (KUR) dalam setahun terakhir',
  },
  podes_pasar: {
    jenis: 'persen',
    predikat: 'memiliki pasar, baik bangunan permanen, semi permanen, maupun tanpa bangunan',
  },
  podes_minimarket: {
    jenis: 'persen',
    predikat: 'memiliki minimarket, swalayan, atau supermarket',
  },
  podes_akomodasi: { jenis: 'persen', predikat: 'memiliki hotel atau penginapan' },
  podes_produk_unggulan: { jenis: 'persen', predikat: 'memiliki produk barang unggulan' },

  // Tata kelola dan sosial (blok tata kelola hanya ditanyakan kepada desa, bukan kelurahan)
  podes_sid: {
    jenis: 'persen',
    predikat: 'memiliki sistem informasi desa dan memperbaruinya',
    unit: DESA_SAJA,
    unitRingkas: DESA_SAJA_RINGKAS,
  },
  podes_siskeudes: {
    jenis: 'persen',
    predikat: 'menggunakan sistem keuangan desa dan memperbaruinya',
    unit: DESA_SAJA,
    unitRingkas: DESA_SAJA_RINGKAS,
  },
  podes_bumdes: {
    jenis: 'persen',
    predikat: 'memiliki sedikitnya satu unit usaha BUMDes',
    unit: DESA_SAJA,
    unitRingkas: DESA_SAJA_RINGKAS,
  },
  podes_perdes_pug: {
    jenis: 'persen',
    predikat: 'memiliki peraturan desa tentang pengarusutamaan gender atau perlindungan anak',
    unit: DESA_SAJA,
    unitRingkas: DESA_SAJA_RINGKAS,
  },
  podes_apbdes_ppa: {
    jenis: 'persen',
    predikat: 'mengalokasikan APBDes untuk pemberdayaan perempuan dan perlindungan anak',
    unit: DESA_SAJA,
    unitRingkas: DESA_SAJA_RINGKAS,
  },
  podes_bpd_perempuan: {
    jenis: 'persen',
    predikat: 'memiliki sedikitnya satu anggota perempuan',
    unit: 'desa/kelurahan yang memiliki BPD atau LMK',
    unitRingkas: 'desa/kel. yang memiliki BPD/LMK',
  },
  podes_lapangan_olahraga: { jenis: 'persen', predikat: 'memiliki lapangan olahraga' },
  podes_ruang_publik: { jenis: 'persen', predikat: 'memiliki ruang publik terbuka' },
  podes_seni_budaya: {
    jenis: 'persen',
    predikat: 'mengadakan kegiatan seni budaya dan olahraga dalam setahun terakhir',
  },
  podes_siskamling: {
    jenis: 'persen',
    predikat: 'mengaktifkan sistem keamanan lingkungan atas inisiatif warga dalam setahun terakhir',
  },
  podes_layanan_pengaduan: {
    jenis: 'persen',
    predikat: 'memiliki layanan pengaduan dan rujukan bagi korban kekerasan',
  },

  // Data sekolah (Dapodik)
  jumlah_sekolah: {
    jenis: 'sekolah',
    templat:
      'Terdapat {a} satuan pendidikan (PAUD, SD/MI, SMP/MTs, SMA/SMK/MA, SLB, dan nonformal) yang terdaftar di {w}.',
  },
  persen_kelas_baik: {
    jenis: 'sekolah',
    templat:
      'Dari seluruh ruang kelas pada satuan pendidikan di {w}, {v} berada dalam kondisi baik; sisanya rusak ringan, sedang, atau berat.',
  },
  persen_akses_internet: {
    jenis: 'sekolah',
    templat:
      'Sebanyak {v} satuan pendidikan di {w} melaporkan memiliki akses internet (dihitung dari sekolah yang mengisi isian akses internet).',
  },
  persen_listrik: {
    jenis: 'sekolah',
    templat:
      'Sebanyak {v} satuan pendidikan di {w} melaporkan memiliki sumber listrik (dihitung dari sekolah yang mengisi isian sumber listrik).',
  },
  persen_akreditasi_ab: {
    jenis: 'sekolah',
    templat: 'Sebanyak {v} satuan pendidikan di {w} berakreditasi A atau B.',
  },
};

export interface MasukanNarasi {
  /** Nama wilayah lengkap, mis. "Kecamatan Ngambur" atau "Kabupaten Pesisir Barat". */
  wilayah: string;
  nilai: number | null;
  satuan: string;
  desimal: number;
  pembilang?: number | null;
  penyebut?: number | null;
}

const isiTemplat = (t: string, data: Record<string, string>): string =>
  t.replace(/\{(\w)\}/g, (_, k: string) => data[k] ?? '');

const nilaiSatuan = (v: number, satuan: string, desimal: number): string =>
  satuan === '%' ? `${formatAngka(v, desimal)}%` : `${formatAngka(v, desimal)} ${satuan}`;

/** Unit penyebut ringkas untuk label "x dari y <unit>", mis. "desa/kelurahan" atau "desa pesisir". */
export function unitPenyebutRingkas(id: string, bawaan = 'desa'): string {
  const n = NARASI_INDIKATOR[id];
  if (n?.jenis === 'persen') return n.unitRingkas ?? n.unit ?? 'desa/kelurahan';
  return bawaan === 'desa' ? 'desa/kelurahan' : bawaan;
}

/**
 * Kalimat penjelasan satu angka indikator untuk satu wilayah.
 * Mengembalikan null bila indikator belum punya narasi atau angkanya tidak tersedia.
 */
export function narasiIndikator(id: string, m: MasukanNarasi): string | null {
  const n = NARASI_INDIKATOR[id];
  if (!n || m.nilai === null) return null;
  if (n.jenis === 'persen') {
    if (m.pembilang === null || m.pembilang === undefined || !m.penyebut) return null;
    return `Di ${m.wilayah}, ${formatAngka(m.pembilang)} dari ${formatAngka(m.penyebut)} ${n.unit ?? 'desa/kelurahan'} (${formatAngka(m.nilai, 1)}%) ${n.predikat}.`;
  }
  if (n.jenis === 'median') {
    if (!m.penyebut) return null;
    return isiTemplat(n.templat, {
      w: m.wilayah,
      n: formatAngka(m.penyebut),
      v: nilaiSatuan(m.nilai, m.satuan, m.desimal),
    });
  }
  return isiTemplat(n.templat, {
    w: m.wilayah,
    v: nilaiSatuan(m.nilai, m.satuan, m.desimal),
    a: formatAngka(m.nilai, m.desimal),
  });
}
