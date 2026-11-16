import type { LstSeries, NdviSeries, SourceInfo } from '@qullqa/shared';
import { fromUrl } from 'geotiff';
import { getJson, pool } from './http.ts';

/**
 * MODIS (NASA) vía Microsoft Planetary Computer: STAC + COG en proyección sinusoidal, token SAS anónimo.
 * Mucho más rápido que el servicio por punto de ORNL para series largas.
 */
const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1';
const R = 6371007.181; // esfera MODIS

interface Item { id: string; properties: { datetime: string; start_datetime?: string }; assets: Record<string, { href: string }> }
interface Page { features: Item[]; links: { rel: string; href: string }[] }

async function searchAll(collection: string, [lon, lat]: [number, number], start: string, end: string): Promise<Item[]> {
  let url: string | null = `${STAC}/search?collections=${collection}&bbox=${lon},${lat},${lon},${lat}&datetime=${start}/${end}&limit=500`;
  const items: Item[] = [];
  while (url) {
    const p: Page = await getJson<Page>(url);
    items.push(...p.features);
    url = p.links.find((l) => l.rel === 'next')?.href ?? null;
  }
  return items;
}

const sinusoidal = ([lon, lat]: [number, number]) => {
  const phi = (lat * Math.PI) / 180;
  return [R * ((lon * Math.PI) / 180) * Math.cos(phi), R * phi] as const;
};

/** Lee el valor del píxel de cada punto en un COG. */
async function readPixels(href: string, token: string, points: [number, number][]): Promise<number[]> {
  const tiff = await fromUrl(`${href}?${token}`);
  const img = await tiff.getImage();
  const [x0, y0] = img.getOrigin() as [number, number];
  const [rx, ry] = img.getResolution() as [number, number];
  const out: number[] = [];
  for (const p of points) {
    const [x, y] = sinusoidal(p);
    const px = Math.floor((x - x0) / rx), py = Math.floor((y - y0) / ry);
    const [band] = (await img.readRasters({ window: [px, py, px + 1, py + 1] })) as unknown as ArrayLike<number>[];
    out.push(band![0]!);
  }
  return out;
}

const token = async () => (await getJson<{ token: string }>('https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs')).token;
const dateOf = (it: Item) => (it.properties.start_datetime ?? it.properties.datetime).slice(0, 10);

export const MODIS_NDVI_PC_SOURCE: SourceInfo = {
  id: 'modis_ndvi',
  product: 'MODIS MOD13Q1 v061, NDVI 16 días',
  producer: 'NASA (LP DAAC)',
  access: 'vía Microsoft Planetary Computer',
  isNasa: true,
  resolution: '250 m, 16 días',
  coverage: null,
  provenance: 'estimated',
  notes: 'Vigor por satélite. El píxel de 250 m suele ser mayor que la parcela (mezcla). No es rendimiento.',
};

export async function fetchNdviPC(points: [number, number][], startYear = 2000, endYear = 2025, log?: (m: string) => void): Promise<NdviSeries[]> {
  const items = (await searchAll('modis-13Q1-061', points[0]!, `${startYear}-01-01`, `${endYear}-12-31`))
    .filter((it) => it.id.startsWith('MOD13Q1'))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  log?.(`  ${items.length} imágenes MOD13Q1 en Planetary Computer`);
  const tok = await token();
  let done = 0;
  const rows = await pool(items, 8, async (it) => {
    const [ndvi, rel] = await Promise.all([
      readPixels(it.assets['250m_16_days_NDVI']!.href, tok, points),
      readPixels(it.assets['250m_16_days_pixel_reliability']!.href, tok, points),
    ]);
    if (++done % 100 === 0) log?.(`  NDVI ${done}/${items.length}`);
    return { date: dateOf(it), ndvi, rel };
  });
  return points.map((_, k) => {
    const s: NdviSeries = { dates: [], ndvi: [], quality: [], pixelSizeM: 250, source: `${MODIS_NDVI_PC_SOURCE.product} ${MODIS_NDVI_PC_SOURCE.access}` };
    for (const r of rows) {
      const raw = r.ndvi[k]!, q = r.rel[k]!;
      const quality = q === 0 ? 'good' : q === 1 ? 'marginal' : q === 2 || q === 3 ? 'cloudy' : 'nodata';
      s.dates.push(r.date);
      s.ndvi.push(raw > -3000 && (quality === 'good' || quality === 'marginal') ? Math.round(raw) / 1e4 : null);
      s.quality.push(quality);
    }
    return s;
  });
}

export const MODIS_LST_SOURCE: SourceInfo = {
  id: 'modis_lst_night',
  product: 'MODIS MYD11A2 v061 (Aqua), temperatura de superficie nocturna 8 días (~01:30)',
  producer: 'NASA (LP DAAC)',
  access: 'vía Microsoft Planetary Computer',
  isNasa: true,
  resolution: '1 km, 8 días',
  coverage: null,
  provenance: 'estimated',
  notes: 'Temperatura de la superficie (no del aire) en noches despejadas. Se usa para estimar δ_posición (aire frío del valle).',
};

export async function fetchLstNightPC(points: [number, number][], startYear = 2003, endYear = 2025, log?: (m: string) => void): Promise<LstSeries[]> {
  const items = (await searchAll('modis-11A2-061', points[0]!, `${startYear}-01-01`, `${endYear}-12-31`))
    .filter((it) => it.id.startsWith('MYD11A2'))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  log?.(`  ${items.length} imágenes MYD11A2 en Planetary Computer`);
  const tok = await token();
  let done = 0;
  const rows = await pool(items, 8, async (it) => {
    const [lst, qc] = await Promise.all([
      readPixels(it.assets['LST_Night_1km']!.href, tok, points),
      readPixels(it.assets['QC_Night']!.href, tok, points),
    ]);
    if (++done % 200 === 0) log?.(`  LST ${done}/${items.length}`);
    return { date: dateOf(it), lst, qc };
  });
  return points.map((_, k) => ({
    dates: rows.map((r) => r.date),
    // Bits 0–1 de QC: 00 = calidad buena. Escala 0,02 K.
    lstNight_C: rows.map((r) => (r.lst[k]! > 0 && (r.qc[k]! & 0b11) === 0 ? Math.round((r.lst[k]! * 0.02 - 273.15) * 100) / 100 : null)),
    source: `${MODIS_LST_SOURCE.product} ${MODIS_LST_SOURCE.access}`,
  }));
}
