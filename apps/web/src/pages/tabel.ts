/**
 * Tabel dinamis: pengunjung menyusun tabel sendiri dari data yang sudah tayang.
 *
 *   1. Indikator per kecamatan : pilih beberapa indikator (lintas tema), baris = kecamatan,
 *                                kolom = indikator. Dapat diurutkan, ditukar, dan diunduh CSV.
 *   2. Tabulasi silang sekolah : banyaknya sekolah menurut dua variabel (kecamatan, jenjang, status,
 *                                akreditasi), sebagai jumlah atau persen baris/kolom/total.
 *
 * Halaman ini tidak menambah data baru: indikator dari /indikator (agregat kecamatan, termasuk Podes)
 * dan hitungan sekolah dari /sekolah/rekap. Semua pilihan tersimpan di URL agar tabel dapat dibagikan.
 */
import { formatAngka, JENJANG, toCsv, urutkanTema } from '@sikop/shared';
import '../styles/sekolah.css';
import { get, qs } from '../lib/api.ts';
import { $, h, isi } from '../lib/dom.ts';
import {
  fmtRingkas,
  LABEL_TAB,
  labelSumber,
  peringkat,
  TEMA_PROFIL,
  type Indikator,
  type Kecamatan,
} from '../lib/indikator.ts';
import { situs } from '../lib/situs.ts';
import { galat, kerangka, kosong } from '../lib/ui.ts';
import { mulaiHalaman } from '../lib/umum.ts';

mulaiHalaman();

type Mode = 'indikator' | 'sekolah';
type IsiSilang = 'jumlah' | 'baris' | 'kolom' | 'total';

const url = new URLSearchParams(location.search);
const keadaan = {
  mode: (url.get('mode') === 'sekolah' ? 'sekolah' : 'indikator') as Mode,
  indikator: [] as Indikator[],
  kecamatan: [] as Kecamatan[],
  pilihan: (url.get('ind') ?? '').split(',').filter(Boolean),
  tema: url.get('tema') ?? '',
  urut: url.get('urut') ?? '',
  arah: url.get('arah') === 'naik' ? 'naik' : 'turun',
  tukar: url.get('tukar') === '1',
  tampil: url.get('tampil') === 'peringkat' ? 'peringkat' : 'nilai',
  baris: url.get('baris') ?? 'kecamatan',
  kolom: url.get('kolom') ?? 'jenjang',
  isiSilang: (url.get('isi') ?? 'jumlah') as IsiSilang,
};
/** Indikator bawaan saat pertama dibuka: satu indikator kunci dari beberapa tema. */
const BAWAAN = ['podes_ada_sma', 'podes_faskes_dasar', 'podes_internet_4g', 'podes_agen_bank'];
const MAKS_INDIKATOR = 15;

function simpanUrl(): void {
  const p: Record<string, string> = { mode: keadaan.mode };
  if (keadaan.mode === 'indikator') {
    Object.assign(p, {
      ind: keadaan.pilihan.join(','),
      tema: keadaan.tema,
      urut: keadaan.urut,
      arah: keadaan.urut ? keadaan.arah : '',
      tukar: keadaan.tukar ? '1' : '',
      tampil: keadaan.tampil === 'peringkat' ? 'peringkat' : '',
    });
  } else {
    Object.assign(p, { baris: keadaan.baris, kolom: keadaan.kolom, isi: keadaan.isiSilang });
  }
  history.replaceState(null, '', location.pathname + qs(p));
}

/** Unduh CSV dari baris objek. BOM di awal agar Excel membaca UTF-8. */
function unduhCsv(nama: string, kolom: string[], baris: Record<string, string>[]): void {
  const blob = new Blob(['﻿' + toCsv(baris, kolom)], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { download: nama, hidden: true });
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/* ------------------------------ Mode 1: indikator per kecamatan ------------------------------ */

const terpilih = (): Indikator[] =>
  keadaan.pilihan
    .map((id) => keadaan.indikator.find((i) => i.id === id))
    .filter((i): i is Indikator => Boolean(i));

const satuanKepala = (i: Indikator): string => (i.satuan === '%' ? '%' : i.satuan);

function sel(i: Indikator, kode: string | null): string {
  if (kode === null) return fmtRingkas(i, i.kabupaten);
  if (keadaan.tampil === 'peringkat') {
    const p = peringkat(i, keadaan.kecamatan, kode);
    return p === null ? '–' : String(p);
  }
  return fmtRingkas(i, i.nilai[kode] ?? null);
}

function urutanKecamatan(): Kecamatan[] {
  const i = keadaan.indikator.find((x) => x.id === keadaan.urut);
  if (!i) return keadaan.kecamatan;
  const naik = keadaan.arah === 'naik';
  return [...keadaan.kecamatan].sort((a, b) => {
    const va = i.nilai[a.kode] ?? null;
    const vb = i.nilai[b.kode] ?? null;
    if (va === null) return 1;
    if (vb === null) return -1;
    return naik ? va - vb : vb - va;
  });
}

function kendaliIndikator(): HTMLElement {
  const tema = urutkanTema(keadaan.indikator.map((i) => i.kategori));
  const daftar = keadaan.indikator.filter((i) => !keadaan.tema || i.kategori === keadaan.tema);
  const pilihTema = h(
    'select',
    { id: 't-tema' },
    h('option', { value: '' }, 'Semua tema'),
    tema.map((t) =>
      h(
        'option',
        { value: t, selected: t === keadaan.tema },
        t === TEMA_PROFIL ? 'Wilayah (karakteristik)' : (LABEL_TAB[t] ?? t),
      ),
    ),
  ) as HTMLSelectElement;
  pilihTema.addEventListener('change', () => {
    keadaan.tema = pilihTema.value;
    gambar();
  });
  const ubah = (id: string, cek: boolean): void => {
    const ada = keadaan.pilihan.includes(id);
    if (cek && !ada && keadaan.pilihan.length < MAKS_INDIKATOR) keadaan.pilihan.push(id);
    if (!cek && ada) keadaan.pilihan = keadaan.pilihan.filter((x) => x !== id);
    gambar();
  };
  const penuh = keadaan.pilihan.length >= MAKS_INDIKATOR;
  return h(
    'section',
    { class: 'panel kendali-tabel', 'aria-labelledby': 'j-kendali' },
    h('h2', { id: 'j-kendali' }, 'Pilih indikator'),
    h('div', { class: 'isian' }, h('label', { for: 't-tema' }, 'Tema'), pilihTema),
    h(
      'fieldset',
      { class: 'daftar-centang' },
      h(
        'legend',
        { class: 'sr' },
        `Indikator${keadaan.tema ? ` tema ${keadaan.tema}` : ''}, pilih paling banyak ${MAKS_INDIKATOR}`,
      ),
      daftar.map((i) => {
        const cek = keadaan.pilihan.includes(i.id);
        const input = h('input', {
          type: 'checkbox',
          value: i.id,
          checked: cek,
          disabled: !cek && penuh,
        }) as HTMLInputElement;
        input.addEventListener('change', () => ubah(i.id, input.checked));
        return h(
          'label',
          { class: 'centang' },
          input,
          h(
            'span',
            null,
            i.nama,
            h('small', null, `${LABEL_TAB[i.kategori] ?? i.kategori} · ${labelSumber(i)}`),
          ),
        );
      }),
    ),
    h(
      'p',
      { class: 'isian__bantu' },
      `${formatAngka(keadaan.pilihan.length)} dari paling banyak ${MAKS_INDIKATOR} indikator dipilih.`,
    ),
    h(
      'div',
      { class: 'baris-tombol' },
      h(
        'button',
        {
          type: 'button',
          class: 'tombol tombol--kecil',
          onclick: () => {
            for (const i of daftar)
              if (!keadaan.pilihan.includes(i.id) && keadaan.pilihan.length < MAKS_INDIKATOR)
                keadaan.pilihan.push(i.id);
            gambar();
          },
        },
        keadaan.tema ? 'Pilih semua di tema ini' : 'Pilih yang tampil',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'tombol tombol--kecil tombol--polos',
          onclick: () => {
            keadaan.pilihan = [];
            keadaan.urut = '';
            gambar();
          },
        },
        'Kosongkan',
      ),
    ),
  );
}

function opsiIndikator(): HTMLElement {
  const tukar = h('input', { type: 'checkbox', id: 't-tukar', checked: keadaan.tukar });
  tukar.addEventListener('change', () => {
    keadaan.tukar = (tukar as HTMLInputElement).checked;
    gambar();
  });
  const tampil = h(
    'select',
    { id: 't-tampil' },
    h('option', { value: 'nilai', selected: keadaan.tampil === 'nilai' }, 'Nilai'),
    h(
      'option',
      { value: 'peringkat', selected: keadaan.tampil === 'peringkat' },
      'Peringkat (1 = terbaik)',
    ),
  ) as HTMLSelectElement;
  tampil.addEventListener('change', () => {
    keadaan.tampil = tampil.value === 'peringkat' ? 'peringkat' : 'nilai';
    gambar();
  });
  return h(
    'div',
    { class: 'opsi-tabel' },
    h('div', { class: 'isian' }, h('label', { for: 't-tampil' }, 'Isi sel'), tampil),
    h('label', { class: 'centang' }, tukar, 'Tukar baris dan kolom'),
  );
}

function tabelIndikator(): HTMLElement {
  const ind = terpilih();
  if (!ind.length)
    return kosong(
      'Belum ada indikator dipilih',
      'Centang satu atau beberapa indikator di sebelah kiri untuk menyusun tabel.',
    );
  const kec = urutanKecamatan();
  const judulKec = keadaan.tukar ? 'Indikator' : 'Kecamatan';
  const kepalaIndikator = (i: Indikator): HTMLElement => {
    const aktif = keadaan.urut === i.id;
    return h(
      'th',
      {
        scope: 'col',
        class: 'kanan',
        'aria-sort': aktif ? (keadaan.arah === 'naik' ? 'ascending' : 'descending') : null,
      },
      h(
        'button',
        {
          type: 'button',
          class: 'urut',
          title: 'Urutkan kecamatan menurut indikator ini',
          onclick: () => {
            keadaan.arah = aktif && keadaan.arah === 'turun' ? 'naik' : 'turun';
            keadaan.urut = i.id;
            gambar();
          },
        },
        i.nama,
      ),
      h('small', { class: 'kepala-satuan' }, satuanKepala(i)),
    );
  };

  const tabel = keadaan.tukar
    ? h(
        'table',
        null,
        h('caption', { class: 'sr' }, 'Indikator terpilih menurut kecamatan'),
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, judulKec),
            kec.map((k) => h('th', { scope: 'col', class: 'kanan' }, k.nama)),
            h('th', { scope: 'col', class: 'kanan' }, 'Kabupaten'),
          ),
        ),
        h(
          'tbody',
          null,
          ind.map((i) =>
            h(
              'tr',
              null,
              h(
                'th',
                { scope: 'row' },
                i.nama,
                h('small', { class: 'kepala-satuan' }, satuanKepala(i)),
              ),
              kec.map((k) => h('td', { class: 'kanan angka' }, sel(i, k.kode))),
              h('td', { class: 'kanan angka tebal' }, sel(i, null)),
            ),
          ),
        ),
      )
    : h(
        'table',
        null,
        h('caption', { class: 'sr' }, 'Kecamatan menurut indikator terpilih'),
        h(
          'thead',
          null,
          h('tr', null, h('th', { scope: 'col' }, judulKec), ind.map(kepalaIndikator)),
        ),
        h(
          'tbody',
          null,
          kec.map((k) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, h('a', { href: `/kecamatan/?kode=${k.kode}` }, k.nama)),
              ind.map((i) => h('td', { class: 'kanan angka' }, sel(i, k.kode))),
            ),
          ),
        ),
        h(
          'tfoot',
          null,
          h(
            'tr',
            null,
            h('td', null, 'Kabupaten Pesisir Barat'),
            ind.map((i) => h('td', { class: 'kanan angka' }, sel(i, null))),
          ),
        ),
      );

  const unduh = (): void => {
    const kolom = ['indikator_id', 'indikator', 'satuan', 'sumber', 'tahun'];
    const wilayah = [...keadaan.kecamatan.map((k) => k.nama), 'Kabupaten Pesisir Barat'];
    const baris = ind.map((i) => {
      const r: Record<string, string> = {
        indikator_id: i.id,
        indikator: i.nama,
        satuan: i.satuan,
        sumber: i.sumber,
        tahun: i.tahun,
      };
      for (const k of keadaan.kecamatan) {
        const v = i.nilai[k.kode];
        r[k.nama] = v === null || v === undefined ? '' : String(v);
      }
      r['Kabupaten Pesisir Barat'] = i.kabupaten === null ? '' : String(i.kabupaten);
      return r;
    });
    unduhCsv('sikop-tabel-indikator.csv', [...kolom, ...wilayah], baris);
  };

  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'j-hasil' },
    h(
      'div',
      { class: 'panel__kepala' },
      h('h2', { id: 'j-hasil' }, 'Tabel'),
      h(
        'div',
        { class: 'baris-tombol' },
        h('button', { type: 'button', class: 'tombol tombol--kecil', onclick: unduh }, 'Unduh CSV'),
      ),
    ),
    opsiIndikator(),
    h('div', { class: 'tabel-wadah tabel-dinamis' }, tabel),
    h(
      'p',
      { class: 'sumber' },
      keadaan.tampil === 'peringkat'
        ? 'Peringkat 1 = terbaik menurut arah indikator; untuk indikator netral, 1 = nilai tertinggi. Nilai sama berbagi peringkat. '
        : '',
      keadaan.tukar ? '' : 'Klik judul kolom untuk mengurutkan kecamatan. ',
      'Angka kabupaten dihitung langsung dari seluruh desa/kelurahan atau sekolah, bukan rata-rata angka kecamatan. Persentase memakai satu desimal; indikator jarak dan waktu tempuh memakai median. Data Podes tampil sebagai agregat kecamatan.',
    ),
    h(
      'details',
      { class: 'catatan-indikator' },
      h('summary', null, 'Sumber dan cara hitung indikator terpilih'),
      h(
        'dl',
        { class: 'dl' },
        ind.map((i) => [
          h('dt', null, i.nama),
          h('dd', null, `${i.metode} Sumber: ${i.sumber}, ${i.tahun}.`),
        ]),
      ),
    ),
  );
}

/* ------------------------------ Mode 2: tabulasi silang sekolah ------------------------------ */

const VARIABEL: Record<string, string> = {
  kecamatan: 'Kecamatan',
  jenjang: 'Jenjang',
  status: 'Status',
  akreditasi: 'Akreditasi',
};
const URUTAN_NILAI: Record<string, () => string[]> = {
  kecamatan: () => keadaan.kecamatan.map((k) => k.kode),
  jenjang: () => [...JENJANG],
  status: () => ['Negeri', 'Swasta'],
  akreditasi: () => ['A', 'B', 'C', 'Belum'],
};
const labelNilai = (v: string, nilai: string): string =>
  v === 'kecamatan'
    ? (keadaan.kecamatan.find((k) => k.kode === nilai)?.nama ?? nilai)
    : v === 'akreditasi' && nilai === 'Belum'
      ? 'Belum terakreditasi'
      : nilai;

let permintaan = 0;
async function tabelSekolah(wadah: HTMLElement): Promise<void> {
  const nomor = ++permintaan;
  const pilih = (id: string, label: string, nilai: [string, string][], kini: string) => {
    const el = h(
      'select',
      { id },
      nilai.map(([v, t]) => h('option', { value: v, selected: v === kini }, t)),
    ) as HTMLSelectElement;
    return { el, isian: h('div', { class: 'isian' }, h('label', { for: id }, label), el) };
  };
  const b = pilih('s-baris', 'Baris', Object.entries(VARIABEL), keadaan.baris);
  const k = pilih(
    's-kolom',
    'Kolom',
    [['', 'Tanpa kolom'], ...Object.entries(VARIABEL).filter(([v]) => v !== keadaan.baris)],
    keadaan.kolom,
  );
  const s = pilih(
    's-isi',
    'Isi sel',
    [
      ['jumlah', 'Jumlah sekolah'],
      ['baris', 'Persen terhadap total baris'],
      ['kolom', 'Persen terhadap total kolom'],
      ['total', 'Persen terhadap total seluruh'],
    ],
    keadaan.isiSilang,
  );
  b.el.addEventListener('change', () => {
    keadaan.baris = b.el.value;
    if (keadaan.kolom === keadaan.baris) keadaan.kolom = '';
    gambar();
  });
  k.el.addEventListener('change', () => {
    keadaan.kolom = k.el.value;
    gambar();
  });
  s.el.addEventListener('change', () => {
    keadaan.isiSilang = s.el.value as IsiSilang;
    gambar();
  });
  const hasil = h('div', { 'aria-live': 'polite' }, kerangka(6));
  isi(
    wadah,
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'j-silang' },
      h('h2', { id: 'j-silang' }, 'Tabulasi silang sekolah'),
      h(
        'p',
        { class: 'teks-redup' },
        'Hitung banyaknya sekolah menurut dua variabel sekaligus, misalnya jenjang menurut kecamatan, atau status negeri dan swasta menurut akreditasi.',
      ),
      h('div', { class: 'opsi-tabel' }, b.isian, k.isian, s.isian),
      hasil,
    ),
  );

  let data: { sel: { baris: string; kolom: string; n: number }[] };
  try {
    data = await get(`/sekolah/rekap${qs({ baris: keadaan.baris, kolom: keadaan.kolom })}`);
  } catch (e) {
    if (nomor === permintaan)
      isi(
        hasil,
        galat(e, () => gambar()),
      );
    return;
  }
  if (nomor !== permintaan) return;

  const nilaiBaris = URUTAN_NILAI[keadaan.baris]!().filter((v) =>
    data.sel.some((x) => x.baris === v),
  );
  const nilaiKolom = keadaan.kolom
    ? URUTAN_NILAI[keadaan.kolom]!().filter((v) => data.sel.some((x) => x.kolom === v))
    : [''];
  const n = (rb: string, kl: string): number =>
    data.sel.find((x) => x.baris === rb && x.kolom === kl)?.n ?? 0;
  const totBaris = (rb: string): number => nilaiKolom.reduce((a, kl) => a + n(rb, kl), 0);
  const totKolom = (kl: string): number => nilaiBaris.reduce((a, rb) => a + n(rb, kl), 0);
  const total = nilaiBaris.reduce((a, rb) => a + totBaris(rb), 0);
  /** Persen baris: setiap baris berjumlah 100. Persen kolom: setiap kolom berjumlah 100. */
  const tampilSel = (v: number, rb: string | null, kl: string | null): string => {
    if (keadaan.isiSilang === 'jumlah') return formatAngka(v);
    const penyebut =
      keadaan.isiSilang === 'baris'
        ? rb !== null
          ? totBaris(rb)
          : total
        : keadaan.isiSilang === 'kolom'
          ? kl !== null
            ? totKolom(kl)
            : total
          : total;
    return penyebut ? formatAngka((100 * v) / penyebut, 1) : '–';
  };
  const judulKolom = keadaan.kolom ? VARIABEL[keadaan.kolom]! : '';
  const judulBaris = VARIABEL[keadaan.baris]!;
  const tabel = h(
    'table',
    null,
    h(
      'caption',
      { class: 'sr' },
      `Banyaknya sekolah menurut ${judulBaris.toLowerCase()}${judulKolom ? ` dan ${judulKolom.toLowerCase()}` : ''}`,
    ),
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col' }, judulBaris),
        keadaan.kolom
          ? nilaiKolom.map((kl) =>
              h('th', { scope: 'col', class: 'kanan' }, labelNilai(keadaan.kolom, kl)),
            )
          : null,
        h('th', { scope: 'col', class: 'kanan' }, keadaan.kolom ? 'Jumlah' : 'Sekolah'),
      ),
    ),
    h(
      'tbody',
      null,
      nilaiBaris.map((rb) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, labelNilai(keadaan.baris, rb)),
          keadaan.kolom
            ? nilaiKolom.map((kl) =>
                h('td', { class: 'kanan angka' }, tampilSel(n(rb, kl), rb, kl)),
              )
            : null,
          h('td', { class: 'kanan angka tebal' }, tampilSel(totBaris(rb), rb, null)),
        ),
      ),
    ),
    h(
      'tfoot',
      null,
      h(
        'tr',
        null,
        h('td', null, 'Jumlah'),
        keadaan.kolom
          ? nilaiKolom.map((kl) =>
              h('td', { class: 'kanan angka' }, tampilSel(totKolom(kl), null, kl)),
            )
          : null,
        h('td', { class: 'kanan angka' }, tampilSel(total, null, null)),
      ),
    ),
  );
  const unduh = (): void => {
    const kolomCsv = [
      judulBaris,
      ...(keadaan.kolom ? nilaiKolom.map((kl) => labelNilai(keadaan.kolom, kl)) : []),
      'Jumlah',
    ];
    const baris = nilaiBaris.map((rb) => {
      const r: Record<string, string> = { [judulBaris]: labelNilai(keadaan.baris, rb) };
      if (keadaan.kolom)
        for (const kl of nilaiKolom) r[labelNilai(keadaan.kolom, kl)] = String(n(rb, kl));
      r.Jumlah = String(totBaris(rb));
      return r;
    });
    unduhCsv('sikop-tabulasi-sekolah.csv', kolomCsv, baris);
  };
  isi(
    hasil,
    h(
      'div',
      { class: 'baris-tombol tabel-aksi' },
      h(
        'p',
        { class: 'teks-redup' },
        `${formatAngka(total)} sekolah. ${keadaan.isiSilang === 'jumlah' ? 'Angka dalam unit sekolah.' : 'Angka dalam persen.'}`,
      ),
      h(
        'button',
        { type: 'button', class: 'tombol tombol--kecil', onclick: unduh },
        'Unduh CSV (jumlah)',
      ),
    ),
    h('div', { class: 'tabel-wadah tabel-dinamis' }, tabel),
    h(
      'p',
      { class: 'sumber' },
      'Sumber: Data Pokok Pendidikan (Dapodik). Akreditasi "Belum" mencakup sekolah yang belum atau tidak terakreditasi.',
    ),
  );
}

/* ------------------------------ Gambar ------------------------------ */

function gambar(): void {
  simpanUrl();
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.setAttribute('aria-pressed', String(b.dataset.mode === keadaan.mode));
  const wadah = $('#isi-tabel');
  if (keadaan.mode === 'sekolah') {
    void tabelSekolah(wadah);
    return;
  }
  // Gambar ulang tidak boleh melompatkan daftar centang ke atas atau menghilangkan fokus keyboard.
  const gulir = document.querySelector('.daftar-centang')?.scrollTop ?? 0;
  const fokus = document.activeElement as HTMLElement | null;
  const kunciFokus = fokus?.id || (fokus instanceof HTMLInputElement ? `cek:${fokus.value}` : '');
  const gulirHalaman = window.scrollY;
  isi(wadah, h('div', { class: 'tata-tabel' }, kendaliIndikator(), tabelIndikator()));
  const daftar = document.querySelector('.daftar-centang');
  if (daftar) daftar.scrollTop = gulir;
  if (kunciFokus) {
    const el = kunciFokus.startsWith('cek:')
      ? document.querySelector<HTMLElement>(
          `.daftar-centang input[value="${CSS.escape(kunciFokus.slice(4))}"]`,
        )
      : document.getElementById(kunciFokus);
    el?.focus({ preventScroll: true });
  }
  window.scrollTo({ top: gulirHalaman });
}

async function mulai(): Promise<void> {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.addEventListener('click', () => {
      keadaan.mode = b.dataset.mode === 'sekolah' ? 'sekolah' : 'indikator';
      gambar();
    });
  isi($('#isi-tabel'), kerangka(8));
  try {
    const [{ indikator }, s] = await Promise.all([
      get<{ indikator: Indikator[] }>('/indikator'),
      situs(),
    ]);
    keadaan.indikator = indikator;
    keadaan.kecamatan = s.kecamatan;
  } catch (e) {
    isi(
      $('#isi-tabel'),
      galat(e, () => void mulai()),
    );
    return;
  }
  keadaan.pilihan = keadaan.pilihan.filter((id) => keadaan.indikator.some((i) => i.id === id));
  if (!keadaan.pilihan.length && !url.has('ind'))
    keadaan.pilihan = BAWAAN.filter((id) => keadaan.indikator.some((i) => i.id === id));
  if (!VARIABEL[keadaan.baris]) keadaan.baris = 'kecamatan';
  if (keadaan.kolom && (!VARIABEL[keadaan.kolom] || keadaan.kolom === keadaan.baris))
    keadaan.kolom = '';
  if (!['jumlah', 'baris', 'kolom', 'total'].includes(keadaan.isiSilang))
    keadaan.isiSilang = 'jumlah';
  gambar();
}

void mulai();
