/**
 * Pages Function: meneruskan seluruh /api/* ke Worker sikop-api melalui service binding "API".
 * Hasilnya situs dan API berada di satu origin: cookie sesi aman (SameSite=Lax, __Host-) tanpa
 * CORS dan tanpa cookie pihak ketiga. Logika tetap sepenuhnya di Worker.
 */
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => env.API.fetch(request);
