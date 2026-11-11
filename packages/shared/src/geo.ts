/**
 * Utilitas geometri kecil (tanpa dependensi) untuk pemeriksaan titik dalam wilayah.
 * Koordinat mengikuti GeoJSON: [bujur, lintang].
 */
export type Position = [number, number] | number[];
export type Ring = Position[];
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Ring[];
}
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Ring[][];
}
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** Uji ray casting untuk satu cincin. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(lon, lat, outer)) return false;
  return !holes.some((h) => inRing(lon, lat, h));
}

/** Apakah titik (lintang, bujur) berada di dalam geometri Polygon/MultiPolygon. */
export function pointInArea(lat: number, lon: number, geom: AreaGeometry): boolean {
  if (geom.type === 'Polygon') return inPolygon(lon, lat, geom.coordinates);
  return geom.coordinates.some((poly) => inPolygon(lon, lat, poly));
}

const R_BUMI_KM = 6371.0088;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Luas cincin pada bola (km²), rumus Chamberlain & Duquette yang juga dipakai Turf. */
function ringAreaKm2(ring: Ring): number {
  let total = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i] as number[];
    const p2 = ring[(i + 1) % n] as number[];
    const p3 = ring[(i + 2) % n] as number[];
    total += (rad(p3[0] as number) - rad(p1[0] as number)) * Math.sin(rad(p2[1] as number));
  }
  return Math.abs((total * R_BUMI_KM * R_BUMI_KM) / 2);
}

/** Luas geometri dalam km² (perkiraan; bergantung pada ketelitian batas). */
export function areaKm2(geom: AreaGeometry): number {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.reduce((sum, rings) => {
    const [outer, ...holes] = rings;
    if (!outer) return sum;
    return sum + ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0);
  }, 0);
}

/** Titik tengah kotak batas, cukup untuk memusatkan peta pada kecamatan. */
export function bboxOf(geom: AreaGeometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const rings of polys)
    for (const ring of rings)
      for (const p of ring) {
        const x = p[0] as number;
        const y = p[1] as number;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}
