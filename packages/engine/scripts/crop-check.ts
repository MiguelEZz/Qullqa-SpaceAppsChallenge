/** Rendimiento simulado por cultivo en una parcela de prueba: tsx scripts/crop-check.ts <valley.json> [lon lat alt riego(0/1)] */
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS as a, CROP_BY_ID, CROPS, FALLOW } from '@qullqa/catalog';
import { buildParcel, season } from '../src/index.ts';
const valley = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const [lon, lat, alt, irr] = [Number(process.argv[3] ?? -71.654), Number(process.argv[4] ?? -15.643), Number(process.argv[5] ?? 3440), process.argv[6] ?? '1'];
const ring: [number, number][] = [[lon, lat], [lon + 0.0005, lat], [lon + 0.0005, lat + 0.0004], [lon, lat + 0.0004], [lon, lat]];
const p = { id: 'x', name: 'prueba', polygon: { type: 'Polygon' as const, coordinates: [ring] }, areaHa: 0.3, centroid: [lon, lat] as [number, number], gpsAltitudeM: alt,
  irrigation: irr === '1' ? { source: 'canal', turnsPerMonth: 3, hoursPerTurn: 3 } : { source: 'none', turnsPerMonth: 0, hoursPerTurn: 0 }, currentRotation: ['haba', 'cebada', 'haba'] as [string, string, string], neighborIds: [], observations: [] };
const m = buildParcel(valley, p, 'u', CROP_BY_ID, a);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
console.log('cultivo'.padEnd(16), 'Yrel', 'Yagua', 'heladas/año', 'pérdida%', 'margen S/ha');
for (const c of CROPS) {
  const ss = m.campaigns.map((y) => season(m, c.id, y, FALLOW.id));
  const yrel = mean(ss.map((s) => s.yrel));
  const yw = mean(ss.map((s) => (s as unknown as { yrelWater: number }).yrelWater));
  const fr = mean(ss.map((s) => s.frostEvents));
  const loss = ss.filter((s) => s.yrel < 0.5).length / ss.length;
  const margin = mean(c.yieldPotential_kgha) * yrel * mean(c.priceRange_soles_kg) - mean(c.costRange_soles_ha);
  console.log(c.id.padEnd(16), yrel.toFixed(2), yw.toFixed(2), fr.toFixed(1).padStart(6), (loss * 100).toFixed(0).padStart(8), Math.round(margin).toString().padStart(8));
}
