import type { LandCover, SourceInfo } from '@qullqa/shared';
import { fromUrl } from 'geotiff';
import { getJson } from './http.ts';

/**
 * ESA WorldCover 2021 v200 (10 m) vía Microsoft Planetary Computer (STAC + COG, token SAS anónimo).
 * Producto de la ESA, NO de la NASA. Se usa solo para elegir/validar puntos de cultivo.
 */
export const WORLDCOVER_SOURCE: SourceInfo = {
  id: 'worldcover',
  product: 'ESA WorldCover 2021 v200 (10 m)',
  producer: 'ESA (Agencia Espacial Europea) — no NASA',
  access: 'vía Microsoft Planetary Computer',
  isNasa: false,
  resolution: '10 m, 2021',
  coverage: null,
  provenance: 'estimated',
  notes: 'Clasificación automática de cobertura del suelo; clase 40 = cultivo. Solo para validar la máscara de cultivo.',
};

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1';
const LABELS: Record<number, string> = {
  10: 'árboles', 20: 'arbustos', 30: 'pastizal', 40: 'cultivo', 50: 'zona urbana', 60: 'suelo desnudo / escasa vegetación',
  70: 'nieve y hielo', 80: 'agua', 90: 'humedal', 95: 'manglar', 100: 'musgo y líquenes',
};
export const CROPLAND = 40;

interface StacSearch { features: { assets: { map: { href: string } } }[] }
interface SasToken { token: string }

async function openMap(lonLat: [number, number]) {
  const res = await fetch(`${STAC}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collections: ['esa-worldcover'], intersects: { type: 'Point', coordinates: lonLat }, query: { 'esa_worldcover:product_version': { eq: '2.0.0' } }, limit: 1 }),
  });
  const s = (await res.json()) as StacSearch;
  const href = s.features[0]?.assets.map.href;
  if (!href) throw new Error('WorldCover: sin tesela para este punto');
  const { token } = await getJson<SasToken>('https://planetarycomputer.microsoft.com/api/sas/v1/token/ai4edataeuwest/esa-worldcover');
  const tiff = await fromUrl(`${href}?${token}`);
  return tiff.getImage();
}

/**
 * Clase de cobertura en cada punto y fracción de cultivo en el cuadro de 250 m que lo rodea
 * (tamaño del píxel MODIS). Si `snapRadiusM` > 0, mueve el punto al lugar del radio con mayor
 * fracción de cultivo en 250 m, para que el NDVI mida andenes y no cerro.
 */
export async function landCoverAt(points: [number, number][], snapRadiusM = 0): Promise<{ point: [number, number]; cover: LandCover }[]> {
  if (!points.length) return [];
  const img = await openMap(points[0]!);
  const [x0, y0] = img.getOrigin() as [number, number];
  const [rx, ry] = img.getResolution() as [number, number]; // grados por píxel (ry < 0)
  const H = 12; // medio cuadro de 250 m ≈ 12 píxeles de 10 m
  const out: { point: [number, number]; cover: LandCover }[] = [];
  for (const p of points) {
    const px = Math.floor((p[0] - x0) / rx);
    const py = Math.floor((p[1] - y0) / ry);
    const R = Math.ceil(snapRadiusM / 10);
    const pad = R + H;
    const w = 2 * pad + 1;
    const [band] = (await img.readRasters({ window: [px - pad, py - pad, px + pad + 1, py + pad + 1] })) as unknown as Uint8Array[];
    // Imagen integral de «es cultivo»
    const I = new Float64Array((w + 1) * (w + 1));
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++)
        I[(y + 1) * (w + 1) + x + 1] = (band![y * w + x] === CROPLAND ? 1 : 0) + I[y * (w + 1) + x + 1]! + I[(y + 1) * (w + 1) + x]! - I[y * (w + 1) + x]!;
    const frac = (cx: number, cy: number) => {
      const a = cx - H + pad, b = cy - H + pad, c = cx + H + pad + 1, d = cy + H + pad + 1;
      return (I[d * (w + 1) + c]! - I[b * (w + 1) + c]! - I[d * (w + 1) + a]! + I[b * (w + 1) + a]!) / ((2 * H + 1) ** 2);
    };
    let best = { dx: 0, dy: 0, f: frac(0, 0), d: 0 };
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dy * dy;
        if (d > R * R || band![(dy + pad) * w + dx + pad] !== CROPLAND) continue;
        const f = frac(dx, dy);
        if (f > best.f + 1e-9 || (Math.abs(f - best.f) < 1e-9 && d < best.d)) best = { dx, dy, f, d };
      }
    const moved = best.dx !== 0 || best.dy !== 0;
    const cls = band![(best.dy + pad) * w + best.dx + pad]!;
    const point: [number, number] = moved ? [x0 + (px + best.dx + 0.5) * rx, y0 + (py + best.dy + 0.5) * ry] : p;
    out.push({
      point: [Math.round(point[0] * 1e6) / 1e6, Math.round(point[1] * 1e6) / 1e6],
      cover: {
        class: cls,
        label: LABELS[cls] ?? `clase ${cls}`,
        cropFraction250m: Math.round(best.f * 100) / 100,
        snappedFrom: moved ? p : null,
        source: `${WORLDCOVER_SOURCE.product} ${WORLDCOVER_SOURCE.access}`,
      },
    });
  }
  return out;
}
