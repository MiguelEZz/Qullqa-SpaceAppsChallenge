import { createHash } from 'node:crypto';
import type { Site, SourceInfo, ValleyDataset } from '@qullqa/shared';
import { SRTM_SOURCE, fetchTerrain } from './elevation.ts';
import { pool } from './http.ts';
import { MODIS_SOURCE, fetchModisNdvi } from './modis.ts';
import { MODIS_LST_SOURCE, MODIS_NDVI_PC_SOURCE, fetchLstNightPC, fetchNdviPC } from './planetary.ts';
import type { DailyClimate, DeltaPosition, LstSeries } from '@qullqa/shared';
import { fetchPowerDaily } from './power.ts';
import { SOILGRIDS_SOURCE, fetchSoil } from './soilgrids.ts';
import { WORLDCOVER_SOURCE, landCoverAt } from './worldcover.ts';
import { IMERG_SOURCE, imergRainCorrection } from './imerg.ts';

export interface SiteSeed { id: string; name: string; lonLat: [number, number] }

export interface BuildOptions {
  id: string;
  name: string;
  center: [number, number];
  sites: SiteSeed[];
  /** Radio para mover cada punto al lugar con más cultivo (WorldCover). */
  snapRadiusM?: number;
  powerEnd?: string;
  modisEndYear?: number;
  log?: (msg: string) => void;
  /** Token de Earthdata: si está, corrige la lluvia de POWER con IMERG mensual. */
  earthdataToken?: string;
}

/**
 * Descarga todas las fuentes y arma el ValleyDataset. Si una fuente falla en un punto,
 * ese campo queda en null y se registra un aviso: nunca se inventa un valor.
 */
export async function buildValleyDataset(o: BuildOptions): Promise<ValleyDataset> {
  const log = o.log ?? (() => {});
  const warnings: string[] = [];
  const sources: Record<string, SourceInfo> = {};

  log('NASA POWER diario…');
  const power = await fetchPowerDaily(o.center, '19810101', o.powerEnd ?? '20251231');
  sources.power = power.source;
  warnings.push(...power.warnings);
  log(`  ${power.daily.dates.length} días (${power.source.coverage!.start} → ${power.source.coverage!.end}), celda a ${power.cell.elevationM} m`);

  log('ESA WorldCover (vía Planetary Computer)…');
  let seeds = o.sites.map((s) => ({ ...s, cover: null as Site['landCover'] }));
  try {
    const lc = await landCoverAt(o.sites.map((s) => s.lonLat), o.snapRadiusM ?? 0);
    seeds = o.sites.map((s, i) => ({ ...s, lonLat: lc[i]!.point, cover: lc[i]!.cover }));
    sources.worldcover = WORLDCOVER_SOURCE;
    for (const s of seeds) {
      log(`  ${s.name}: ${s.cover!.label}, ${Math.round(s.cover!.cropFraction250m * 100)} % cultivo en 250 m${s.cover!.snappedFrom ? ' (punto movido)' : ''}`);
      if (s.cover!.cropFraction250m < 0.5) warnings.push(`${s.name}: solo ${Math.round(s.cover!.cropFraction250m * 100)} % de cultivo en el píxel MODIS; el NDVI mezcla cultivo con otra cobertura.`);
    }
  } catch (e) {
    warnings.push(`WorldCover no disponible (${(e as Error).message}); puntos sin validar como cultivo.`);
  }

  log('Elevación SRTM…');
  let terrain: (Site['terrain'])[] = seeds.map(() => null);
  try {
    terrain = await fetchTerrain(seeds.map((s) => s.lonLat));
    sources.srtm = SRTM_SOURCE;
  } catch (e) {
    warnings.push(`SRTM no disponible: ${(e as Error).message}`);
  }

  log('SoilGrids…');
  const soil = await pool(seeds, 1, async (s) => {
    try { return await fetchSoil(s.lonLat); } catch (e) { warnings.push(`SoilGrids sin dato en ${s.name}: ${(e as Error).message}`); return null; }
  });
  if (soil.some(Boolean)) sources.soilgrids = SOILGRIDS_SOURCE;

  let rainCorrection: ValleyDataset['climate']['rainCorrection'] = null;
  if (o.earthdataToken) {
    log('GPM IMERG mensual (corrección de sesgo de la lluvia)…');
    try {
      rainCorrection = await correctRain(power.daily, o.earthdataToken, o.center, sources, log);
    } catch (e) {
      warnings.push(`IMERG no disponible (${(e as Error).message}): la lluvia es la de POWER sin corregir, que en el Colca parece subestimada.`);
    }
  } else warnings.push('Sin token de Earthdata: la lluvia es la de POWER sin corregir con IMERG.');

  const pts = seeds.map((s) => s.lonLat);
  log('MODIS NDVI vía Planetary Computer…');
  let ndvi: (Site['ndvi'])[] = seeds.map(() => null);
  try {
    ndvi = await fetchNdviPC(pts, 2000, o.modisEndYear ?? 2025, log);
    sources.modis_ndvi = { ...MODIS_NDVI_PC_SOURCE };
  } catch (e) {
    warnings.push(`Planetary Computer sin NDVI (${(e as Error).message}); se intenta ORNL.`);
    ndvi = await pool(seeds, 1, async (s) => {
      try { return await fetchModisNdvi(s.lonLat, 2000, o.modisEndYear ?? 2025); } catch (err) { warnings.push(`MODIS sin dato en ${s.name}: ${(err as Error).message}`); return null; }
    });
    if (ndvi.some(Boolean)) sources.modis_ndvi = { ...MODIS_SOURCE };
  }
  const okNdvi = ndvi.filter((n) => n !== null);
  if (okNdvi.length && sources.modis_ndvi) {
    const all = okNdvi.flatMap((n) => n.dates).sort();
    sources.modis_ndvi.coverage = { start: all[0]!, end: all.at(-1)! };
    okNdvi.forEach((n, k) => log(`  ${seeds[k]?.name}: ${n.ndvi.filter((v) => v !== null).length}/${n.dates.length} fechas utilizables`));
  }

  log('MODIS LST nocturna (Aqua) vía Planetary Computer…');
  let lst: (LstSeries | null)[] = seeds.map(() => null);
  try {
    lst = await fetchLstNightPC(pts, 2003, o.modisEndYear ?? 2025, log);
    const all = lst[0]!.dates;
    sources.modis_lst_night = { ...MODIS_LST_SOURCE, coverage: { start: all[0]!, end: all.at(-1)! } };
  } catch (e) {
    warnings.push(`Sin LST nocturna MODIS (${(e as Error).message}): δ_posición queda en el supuesto por defecto.`);
  }
  const delta = seeds.map((s, k) => {
    const elev = terrain[k]?.elevationM;
    const l = lst[k];
    if (!l || elev === undefined) return null;
    const d = estimateDelta(power.daily, power.cell.elevationM, elev, l);
    log(`  ${s.name}: δ_posición por mes = ${d.byMonth.map((x) => x.toFixed(1)).join(' ')} °C`);
    return d;
  });

  const sites: Site[] = seeds.map((s, i) => ({ id: s.id, name: s.name, lonLat: s.lonLat, terrain: terrain[i] ?? null, soil: soil[i] ?? null, ndvi: ndvi[i] ?? null, landCover: s.cover, lstNight: lst[i] ?? null, deltaPosition: delta[i] ?? null }));
  const body = { schemaVersion: 1 as const, id: o.id, name: o.name, center: o.center, climate: { cell: power.cell, daily: power.daily, rainCorrection }, sites, sources, warnings };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { ...body, version, createdAt: new Date().toISOString() };
}

/**
 * δ_posición mensual = media(Tmin_celda − lapse·Δz) − media(LST nocturna), en los días de cada imagen
 * de 8 días con dato de calidad buena. Mismo gradiente que el motor (0,0065 °C/m).
 */
export function estimateDelta(daily: DailyClimate, cellElev: number, elev: number, lst: LstSeries, lapse = 0.0065): DeltaPosition {
  const shift = -lapse * (elev - cellElev);
  const idx = new Map(daily.dates.map((d, i) => [d, i]));
  const sums = Array.from({ length: 12 }, () => ({ t: 0, l: 0, n: 0 }));
  lst.dates.forEach((d0, k) => {
    const v = lst.lstNight_C[k];
    if (v === null || v === undefined) return;
    const i0 = idx.get(d0);
    if (i0 === undefined) return;
    let t = 0, n = 0;
    for (let j = i0; j < i0 + 8 && j < daily.dates.length; j++) { t += daily.tmin[j]! + shift; n++; }
    if (!n) return;
    const m = Number(d0.slice(5, 7)) - 1;
    sums[m]!.t += t / n; sums[m]!.l += v; sums[m]!.n++;
  });
  const byMonth = sums.map((s) => (s.n ? Math.round(((s.t - s.l) / s.n) * 100) / 100 : 0));
  return {
    byMonth,
    provenance: 'estimated',
    source: `NASA POWER (Tmin corregida por altitud) vs ${lst.source}`,
    method: 'δ[mes] = media(Tmin_celda − 0,0065·Δz) − media(LST nocturna de calidad buena). La LST es temperatura de la superficie en noches despejadas, no del aire: puede exagerar el frío.',
  };
}

/** Aplica (idempotente) la corrección mensual de IMERG a la lluvia diaria de POWER. */
export async function correctRain(daily: DailyClimate, token: string, center: [number, number], sources: Record<string, SourceInfo>, log?: (m: string) => void): Promise<NonNullable<ValleyDataset['climate']['rainCorrection']>> {
  const raw = daily.rainRaw ?? daily.rain.slice();
  const corr = await imergRainCorrection(token, center, { ...daily, rain: raw }, 2001, 2024, log);
  daily.rainRaw = raw;
  daily.rain = raw.map((r, i) => Math.round(r * corr.factorByMonth[Number(daily.dates[i]!.slice(5, 7)) - 1]! * 100) / 100);
  sources.imerg_monthly = { ...IMERG_SOURCE, coverage: { start: `${corr.years[0]}-01-01`, end: `${corr.years[1]}-12-31` } };
  sources.power = { ...sources.power!, notes: `${sources.power!.notes ?? ''} Lluvia corregida por sesgo mensual con GPM IMERG.`.trim() };
  log?.(`  factor por mes: ${corr.factorByMonth.join(' ')}`);
  return { ...corr, source: `${IMERG_SOURCE.product} (${IMERG_SOURCE.producer})` };
}
