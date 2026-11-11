/**
 * Pesan validasi Bahasa Indonesia yang ramah untuk seluruh skema (API dan form).
 * Kasus umum diberi kalimat singkat; sisanya jatuh ke lokal bawaan Zod "id".
 */
import { z } from 'zod';

z.config(z.locales.id());
z.config({
  customError: (iss) => {
    switch (iss.code) {
      case 'invalid_type':
        return iss.input === undefined || iss.input === null
          ? 'Wajib diisi.'
          : 'Format isian tidak valid.';
      case 'too_small':
        if (iss.origin === 'string')
          return Number(iss.minimum) <= 1 ? 'Wajib diisi.' : `Minimal ${iss.minimum} karakter.`;
        if (iss.origin === 'array') return `Minimal ${iss.minimum} butir.`;
        return `Nilai minimal ${iss.minimum}.`;
      case 'too_big':
        if (iss.origin === 'string') return `Maksimal ${iss.maximum} karakter.`;
        if (iss.origin === 'array') return `Maksimal ${iss.maximum} butir.`;
        return `Nilai maksimal ${iss.maximum}.`;
      case 'invalid_format':
        return iss.format === 'email' ? 'Format email tidak valid.' : 'Format isian tidak valid.';
      case 'invalid_value':
        return 'Pilihan tidak valid.';
      default:
        return undefined;
    }
  },
});
