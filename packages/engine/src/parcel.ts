import type { EngineInput, Provenance, Site, SoilProfile, ValleyDataset } from '@qullqa/shared';
import { type Assumptions, type CropCard, FALLOW } from '@qullqa/catalog';
import { type ParcelClimate, type WhatIf, parcelClimate } from './climate.ts';
import { erodibilityK, lsFactor, saxtonRawls } from './soil.ts';
import { type SeasonResult, type SiteParams, type SoilState, referenceState, simulateSeason, sowingDay } from './water.ts';

export type InputParcel = EngineInput['participants'][number]['parcels'][number];

/** Un valor con procedencia y fuente: así sale todo del motor. */
export interface Traced<T> { value: T; provenance: Provenance; source: string }

export interface ParcelModel {
  id: string;
  name: string;
  ownerId: string;
  areaHa: number;
  centroid: [number, number];
  neighborIds: string[];
  currentRotation: [string, string, string];
  elevation: Traced<number>;
  slope: Traced<number>;
  terraces: Traced<boolean>;
  /** δ_posición por mes (°C) aplicado a la Tmin. */
  deltaPosition: Traced<number[]>;
  soil: Traced<SoilProfile> | null;
  site: Site;
  irrigated: boolean;
  climate: ParcelClimate;
  params: SiteParams;
  crops: Record<string, CropCard>;
  a: Assumptions;
  /** Campañas completas simulables (1 jul → 30 jun). */
  campaigns: number[];
  /** Memo de campañas: crop|campaña|anterior → resultado. */
  memo: Map<string, SeasonResult>;
  sowMemo: Map<string, { idx: number; late: boolean }>;
  ref: SoilState;
}

const dist2 = (a: [number, number], b: [number, number]) => (a[0] - b[0]) ** 2 + ((a[1] - b[1]) * Math.cos((a[1] * Math.PI) / 180)) ** 2;

export function nearestSite(valley: ValleyDataset, p: [number, number]): Site {
  return [...valley.sites].sort((x, y) => dist2(x.lonLat, p) - dist2(y.lonLat, p))[0]!;
}

/** Suelo de respaldo si SoilGrids falló en todos los puntos (supuesto, se avisa). */
const DEFAULT_SOIL: SoilProfile = { clayPct: 20, sandPct: 40, siltPct: 40, socPct: 1.5, omPct: 2.6, ph: 6.8, bulkDensity_gcm3: 1.3, source: 'Franco genérico (supuesto: sin dato de SoilGrids)' };

export function buildParcel(valley: ValleyDataset, p: InputParcel, ownerId: string, crops: Record<string, CropCard>, a: Assumptions, whatIf: WhatIf = {}): ParcelModel {
  const site = nearestSite(valley, p.centroid);
  const elevation: Traced<number> =
    p.gpsAltitudeM !== null ? { value: p.gpsAltitudeM, provenance: 'observed', source: 'GPS del celular (altitud, ±10–30 m)' }
    : site.terrain ? { value: site.terrain.elevationM, provenance: 'estimated', source: `${site.terrain.source} en ${site.name}` }
    : { value: a.climate.defaultElevationM, provenance: 'assumed', source: 'Altitud típica del corredor (supuesto)' };

  const slopeObs = [...p.observations].filter((o) => o.value.type === 'slope').sort((x, y) => y.observedAt.localeCompare(x.observedAt))[0];
  const slope: Traced<number> = slopeObs && slopeObs.value.type === 'slope'
    ? { value: slopeObs.value.slopeDeg, provenance: 'observed', source: 'Inclinómetro del celular' }
    : { value: a.erosion.terraceSlopeDeg, provenance: 'assumed', source: 'Pendiente típica de un andén (supuesto; mídela con el celular)' };
  const terraces: Traced<boolean> = slope.value <= a.erosion.terraceMaxSlopeDeg
    ? { value: true, provenance: 'assumed', source: `Se asume andén (pendiente ≤ ${a.erosion.terraceMaxSlopeDeg}°)` }
    : { value: false, provenance: 'assumed', source: `Se asume ladera sin andén (pendiente > ${a.erosion.terraceMaxSlopeDeg}°)` };

  const soilProfile = site.soil ?? valley.sites.find((s) => s.soil)?.soil ?? null;
  const soil: Traced<SoilProfile> | null = soilProfile
    ? { value: soilProfile, provenance: 'estimated', source: `${soilProfile.source} en ${site.name}` }
    : null;
  const sp = soilProfile ?? DEFAULT_SOIL;
  const hydraulics = saxtonRawls(sp.sandPct, sp.clayPct, sp.omPct);

  const ir = p.irrigation;
  const irrigated = ir.source !== 'none' && ir.turnsPerMonth > 0 && ir.hoursPerTurn > 0;
  const params: SiteParams = {
    hydraulics,
    profileDepth_m: a.soil.profileDepth_m,
    irrigation: irrigated
      ? { grossPerTurn_mm: (a.irrigation.flow_Ls * 3.6 * ir.hoursPerTurn) / (Math.max(0.01, p.areaHa) * 10), intervalDays: Math.max(1, Math.round(30 / ir.turnsPerMonth)) }
      : null,
    erosionKLSP: erodibilityK(sp) * lsFactor(slope.value, terraces.value ? a.erosion.terraceLength_m : a.erosion.slopeLength_m) * (terraces.value ? a.erosion.practiceP_terraces : a.erosion.practiceP_slope),
  };
  const dp = site.deltaPosition ?? valley.sites.find((s) => s.deltaPosition)?.deltaPosition ?? null;
  const deltaPosition: Traced<number[]> = dp
    ? { value: dp.byMonth.map((d) => Math.max(0, d - a.climate.lstSkinOffset_C)), provenance: 'estimated', source: `${dp.source} (${site.name}), menos ${a.climate.lstSkinOffset_C} °C por ser temperatura de superficie (supuesto)` }
    : { value: Array(12).fill(a.climate.deltaPosition_C), provenance: 'assumed', source: 'δ_posición por defecto (supuesto): calibrar con reportes de helada' };
  const climate = parcelClimate(valley, elevation.value, p.centroid[1], a, whatIf, deltaPosition.value);
  return {
    id: p.id, name: p.name, ownerId, areaHa: p.areaHa, centroid: p.centroid, neighborIds: p.neighborIds,
    currentRotation: p.currentRotation as [string, string, string],
    elevation, slope, terraces, deltaPosition, soil, site, irrigated, climate, params, crops, a,
    campaigns: climate.campaigns, memo: new Map(), sowMemo: new Map(), ref: referenceState(params),
  };
}

const cropOf = (m: ParcelModel, id: string): CropCard | null => (id === FALLOW.id ? null : m.crops[id] ?? null);

function sow(m: ParcelModel, crop: CropCard, y: number) {
  const k = `${crop.id}|${y}`;
  let s = m.sowMemo.get(k);
  if (!s) { s = sowingDay(m.climate, crop, y, m.irrigated, m.a); m.sowMemo.set(k, s); }
  return s;
}

/** Campaña del cultivo `crop` en `y`, partiendo del suelo que dejó `prev` en y−1 (null = estado de referencia). */
export function season(m: ParcelModel, crop: string, y: number, prev: string | null): SeasonResult {
  const key = `${crop}|${y}|${prev ?? '-'}`;
  const hit = m.memo.get(key);
  if (hit) return hit;
  let init = m.ref;
  if (prev !== null && m.climate.campaignStart.has(y - 1) && m.campaigns.includes(y - 1)) init = season(m, prev, y - 1, null).end;
  const c = cropOf(m, crop);
  const r = simulateSeason(m.climate, y, c, c ? sow(m, c, y) : null, m.params, init, m.a);
  m.memo.set(key, r);
  return r;
}

// ───────────── Filtro de aptitud (spec §6) ─────────────
export type Aptitude = 'apt' | 'marginal' | 'notApt';
export interface AptitudeResult { crop: string; aptitude: Aptitude; reasons: string[]; provenance: 'simulated'; years: number }

export function assessAptitude(m: ParcelModel, crop: CropCard): AptitudeResult {
  const a = m.a.aptitude;
  const ys = m.campaigns;
  const n = ys.length;
  let frost = 0, gddFail = 0, water = 0;
  for (const y of ys) {
    const s = season(m, crop.id, y, FALLOW.id);
    if (s.frostEvents > 0) frost++;
    if (s.gdd < crop.gdd_needed) gddFail++;
    if (s.yrelWater < 0.5) water++;
  }
  const reasons: string[] = [];
  let level = 0; // 0 apto, 1 marginal, 2 no apto
  const bump = (l: number, msg: string) => { level = Math.max(level, l); reasons.push(msg); };
  const of = (k: number) => `${k} de ${n} campañas`;
  const minFrost = Math.max(...crop.stages.map((s) => s.frostKill_C));

  if (frost / n > a.frostNotApt) bump(2, `En ${of(frost)} la temperatura mínima bajó del límite de daño (${minFrost} °C) durante el cultivo.`);
  else if (frost / n > a.frostMarginal) bump(1, `Riesgo de helada: en ${of(frost)} hubo al menos una helada dañina durante el cultivo.`);
  if (gddFail / n > a.gddNotApt) bump(2, `No madura a esta altura: en ${of(gddFail)} no juntó el calor necesario (${crop.gdd_needed} grados-día).`);
  else if (gddFail / n > a.gddMarginal) bump(1, `Maduración justa: en ${of(gddFail)} le faltó calor para completar el ciclo.`);
  const wTxt = m.irrigated ? 'aun con tu riego' : 'sin riego';
  if (water / n > a.waterChronicNotApt) bump(2, `Agua insuficiente ${wTxt}: en ${of(water)} el rendimiento por sequía habría caído a menos de la mitad.`);
  else if (water / n > a.waterMarginal) bump(1, `Sequía frecuente ${wTxt}: en ${of(water)} el rendimiento habría caído a menos de la mitad.`);
  const z = m.elevation.value;
  const [lo, hi] = crop.altRange;
  if (z < lo - m.a.aptitude.altMarginMarginal_m || z > hi + m.a.aptitude.altMarginMarginal_m) bump(2, `Fuera de su rango de altitud (${lo}–${hi} m); tu parcela está a ${Math.round(z)} m.`);
  else if (z < lo || z > hi) bump(1, `Al borde de su rango de altitud (${lo}–${hi} m); tu parcela está a ${Math.round(z)} m.`);
  const ph = m.soil?.value.ph;
  if (ph !== undefined) {
    if (ph < a.phMin - 1 || ph > a.phMax + 1) bump(2, `pH del suelo extremo (${ph}, estimado por SoilGrids).`);
    else if (ph < a.phMin || ph > a.phMax) bump(1, `pH del suelo poco favorable (${ph}, estimado por SoilGrids).`);
  }
  if (!reasons.length) reasons.push(`Pasa todos los filtros en ${n} campañas de clima (NASA POWER, corregido a ${Math.round(z)} m).`);
  return { crop: crop.id, aptitude: (['apt', 'marginal', 'notApt'] as const)[level]!, reasons, provenance: 'simulated', years: n };
}
