/** Binding dan variabel lingkungan Worker (lihat wrangler.toml dan .dev.vars.example). */
export interface Env {
  DB: D1Database;
  RL_TULIS?: RateLimit;
  ENVIRONMENT: 'production' | 'staging' | 'development';
  ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET?: string;
  IP_SALT?: string;
  SUPERADMIN_EMAILS?: string;
  DEV_LOGIN?: string;
}

/** Konteks yang diisi middleware untuk setiap permintaan. */
export interface Vars {
  requestId: string;
  akun: AkunSesi | null;
}

export interface AkunSesi {
  id: string;
  email: string;
  nama: string;
  peran: import('@sikop/shared').Peran | null;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
