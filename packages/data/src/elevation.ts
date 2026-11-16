import type { SourceInfo, TerrainInfo } from '@qullqa/shared';
import { getJson, offsetM, sleep } from './http.ts';

/**
 * Elevación SRTM 30 m (NASA/NGA) vía OpenTopoData. Pendiente y orientación por diferencias
 * centrales con 4 vecinos a 30 m (una celda SRTM).
 */
export const SRTM_SOURCE: SourceInfo = {
  id: 'srtm',
  product: 'SRTM GL1 30 m',
  producer: 'NASA / NGA',
  access: 'API OpenTopoData (srtm30m)',
  isNasa: true,
  resolution: '30 m, estático (2000)',
  coverage: null,
  provenance: 'estimated',
  notes: 'Pendiente de 30 m; en andenes la pendiente real de la terraza es menor (mejor medirla con el celular).',
};

interface OtdResp { results: { elevation: number | null }[]; status: string }

const STEP = 30;

export async function fetchTerrain(points: [number, number][]): Promise<TerrainInfo[]> {
  const locs: [number, number][] = [];
  for (const p of points) locs.push(p, offsetM(p, 0, STEP), offsetM(p, 0, -STEP), offsetM(p, STEP, 0), offsetM(p, -STEP, 0));
  const elev: (number | null)[] = [];
  for (let i = 0; i < locs.length; i += 100) {
    const batch = locs.slice(i, i + 100).map(([lo, la]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join('|');
    const r = await getJson<OtdResp>(`https://api.opentopodata.org/v1/srtm30m?locations=${batch}`);
    elev.push(...r.results.map((x) => x.elevation));
    await sleep(1100); // límite público: 1 petición/s
  }
  return points.map((_, k) => {
    const [z, n, s, e, w] = elev.slice(k * 5, k * 5 + 5);
    if (z == null || n == null || s == null || e == null || w == null) throw new Error('SRTM sin dato en un punto');
    const dzdx = (e - w) / (2 * STEP);
    const dzdy = (n - s) / (2 * STEP);
    const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    // Orientación = hacia dónde mira la ladera (dirección de bajada), desde el norte
    const aspectDeg = (((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI) + 360) % 360;
    return { elevationM: z, slopeDeg: Math.round(slopeDeg * 10) / 10, aspectDeg: Math.round(aspectDeg), source: SRTM_SOURCE.product };
  });
}
