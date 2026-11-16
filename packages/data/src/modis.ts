import type { NdviSeries, SourceInfo } from '@qullqa/shared';
import { getJson, pool } from './http.ts';

/**
 * MODIS MOD13Q1 v061 (NDVI 250 m, 16 días) por punto, vía ORNL DAAC MODIS Web Service.
 * El servicio limita a 10 fechas por petición. Se pide NDVI y la confiabilidad del píxel.
 */
const BASE = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1';

interface DatesResp { dates: { modis_date: string; calendar_date: string }[] }
interface SubsetResp { subset: { modis_date: string; calendar_date: string; band: string; data: number[] }[]; scale: string }

export const MODIS_SOURCE: SourceInfo = {
  id: 'modis_ndvi',
  product: 'MODIS MOD13Q1 v061, NDVI 16 días',
  producer: 'NASA (LP DAAC)',
  access: 'ORNL DAAC MODIS Web Service',
  isNasa: true,
  resolution: '250 m, 16 días',
  coverage: null,
  provenance: 'estimated',
  notes: 'Vigor por satélite. El píxel de 250 m suele ser mayor que la parcela (mezcla). No es rendimiento.',
};

export async function fetchModisNdvi(lonLat: [number, number], startYear = 2000, endYear = 2025): Promise<NdviSeries> {
  const [lon, lat] = lonLat;
  const all = await getJson<DatesResp>(`${BASE}/dates?latitude=${lat}&longitude=${lon}`);
  const dates = all.dates.filter((d) => {
    const y = Number(d.calendar_date.slice(0, 4));
    return y >= startYear && y <= endYear;
  });
  const chunks: (typeof dates)[] = [];
  for (let i = 0; i < dates.length; i += 10) chunks.push(dates.slice(i, i + 10));

  const band = async (name: string) => {
    const parts = await pool(chunks, 4, (c) =>
      getJson<SubsetResp>(
        `${BASE}/subset?latitude=${lat}&longitude=${lon}&band=${name}` +
          `&startDate=${c[0]!.modis_date}&endDate=${c.at(-1)!.modis_date}&kmAboveBelow=0&kmLeftRight=0`,
        { headers: { Accept: 'application/json' } },
      ),
    );
    const map = new Map<string, number>();
    for (const p of parts) for (const s of p.subset) map.set(s.calendar_date, s.data[0]!);
    return map;
  };
  const ndviRaw = await band('250m_16_days_NDVI');
  const rel = await band('250m_16_days_pixel_reliability');

  const out: NdviSeries = { dates: [], ndvi: [], quality: [], pixelSizeM: 250, source: MODIS_SOURCE.product };
  for (const d of dates) {
    const raw = ndviRaw.get(d.calendar_date);
    const r = rel.get(d.calendar_date);
    // Confiabilidad MOD13Q1: 0 bueno, 1 marginal, 2 nieve/hielo, 3 nube, −1 sin dato
    const quality = r === 0 ? 'good' : r === 1 ? 'marginal' : r === 2 || r === 3 ? 'cloudy' : 'nodata';
    const usable = raw !== undefined && raw > -3000 && (quality === 'good' || quality === 'marginal');
    out.dates.push(d.calendar_date);
    out.ndvi.push(usable ? Math.round(raw! * 1e-4 * 1e4) / 1e4 : null);
    out.quality.push(raw === undefined ? 'nodata' : quality);
  }
  return out;
}
