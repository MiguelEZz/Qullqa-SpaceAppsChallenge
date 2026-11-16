import type { Assumptions, CropCard } from '@qullqa/catalog';
import { FALLOW } from '@qullqa/catalog';
import { INDICATORS, type IndicatorId } from '@qullqa/shared';
import type { IndicatorValue } from './indicators.ts';
import type { AptitudeResult, InputParcel, ParcelModel } from './parcel.ts';
import type { Rotation, RotationStats } from './rotation.ts';
import { campaignLabel, mean, percentile, round, shortDate } from './util.ts';
import { season } from './parcel.ts';

/** Nivel de confianza (spec §10): siempre dice qué falta para subir. */
export interface Confidence {
  level: 'alta' | 'media' | 'baja';
  met: string[];
  missing: string[];
}

export function confidence(m: ParcelModel, p: InputParcel, rot: Rotation, crops: Record<string, CropCard>, a: Assumptions, nowIso: string): Confidence {
  const met: string[] = [], missing: string[] = [];
  const check = (ok: boolean, yes: string, no: string) => (ok ? met : missing).push(ok ? yes : no);
  const years = m.campaigns.length;
  check(years >= a.confidence.minYearsHigh, `${years} campañas de clima (NASA POWER)`, `Menos de ${a.confidence.minYearsHigh} años de clima`);
  const nd = m.site.ndvi;
  const good = nd ? nd.quality.filter((q) => q === 'good').length / Math.max(1, nd.quality.length) : 0;
  check(!!nd && good >= a.confidence.minNdviGoodFraction, `NDVI MODIS con ${Math.round(good * 100)} % de imágenes sin nubes`, nd ? `Solo ${Math.round(good * 100)} % de imágenes NDVI sin nubes` : 'Falta la serie NDVI de MODIS en este punto');
  const pixelHa = ((nd?.pixelSizeM ?? 250) ** 2) / 10_000;
  check(m.areaHa >= pixelHa / 2, 'La parcela es comparable al píxel MODIS', `El píxel MODIS (${round(pixelHa, 1)} ha) es más grande que tu parcela (${round(m.areaHa, 2)} ha): falta NDVI de 30 m (HLS)`);
  const now = Date.parse(nowIso);
  const recent = p.observations.filter((o) => now - Date.parse(o.observedAt) <= a.confidence.maxObservationAgeDays * 86_400_000);
  check(recent.length > 0, `${recent.length} observaciones de campo recientes`, 'Faltan observaciones de campo recientes (foto de cobertura, puño, pendiente)');
  const stressObs = p.observations.filter((o) => o.value.type === 'wilting' || o.value.type === 'soil_moisture').length;
  check(stressObs > 0, `${stressObs} reportes de humedad o marchitez para contrastar con el modelo`, 'Faltan reportes de humedad (prueba del puño) o marchitez para validar el estrés hídrico');
  const assumedCrops = rot.filter((id) => id !== FALLOW.id && crops[id]?.paramsProvenance === 'assumed').map((id) => crops[id]!.name);
  check(!assumedCrops.length, 'Parámetros de cultivo de FAO (genéricos, no INIA)', `Parámetros de ${[...new Set(assumedCrops)].join(', ')} por analogía (sin valores FAO ni INIA)`);
  const harvests = p.observations.filter((o) => o.value.type === 'harvest').length;
  check(harvests > 0, `${harvests} cosechas registradas calibran el rendimiento`, 'Falta registrar una cosecha (kg y área): es el dato que más sube la confianza');
  const level = met.length >= 6 ? 'alta' : met.length >= 4 ? 'media' : 'baja';
  return { level, met, missing };
}

export type StrategyId = 'current' | 'individual' | 'community';
export const STRATEGY_TITLE: Record<StrategyId, string> = {
  current: 'Rotación actual',
  individual: 'Mejor plan individual',
  community: 'Plan comunitario coordinado',
};

export interface ParcelPlanView {
  parcelId: string;
  parcelName: string;
  rotation: { campaign: string; crop: string; cropName: string; sowing: string | null; harvest: string | null }[];
  indicators: Record<IndicatorId, IndicatorValue>;
  utility: number;
  failYears: number;
  years: number;
}

export interface StrategyCard {
  strategy: StrategyId;
  title: string;
  parcels: ParcelPlanView[];
  /** Utilidad U_i (0–1) según sus 10 monedas. */
  utility: number;
  /** Indicadores agregados (promedio ponderado por área). */
  indicators: Record<IndicatorId, IndicatorValue>;
  why: string[];
  evidence: string[];
  benefits: string[];
  missing: string[];
  risks: string[];
  confidence: Confidence;
  disclaimer: string;
}

const nameOf = (id: string, crops: Record<string, CropCard>) => (id === FALLOW.id ? 'Descanso' : crops[id]?.name ?? id);
export const rotationText = (r: Rotation, crops: Record<string, CropCard>) => r.map((x) => nameOf(x, crops)).join(' → ');

/** Calendario típico (siembra y cosecha medianas) de cada campaña de la rotación. */
export function calendar(m: ParcelModel, r: Rotation, firstCampaign: number, crops: Record<string, CropCard>) {
  return r.map((crop, s) => {
    const sows: number[] = [], harvs: number[] = [];
    if (crop !== FALLOW.id) for (const y of m.campaigns) {
      const res = season(m, crop, y, 'descanso');
      if (res.sowIdx >= 0) { sows.push(m.climate.days[res.sowIdx]!.doy); harvs.push(m.climate.days[res.harvestIdx]!.doy); }
    }
    const doyLabel = (doy: number) => {
      const d = new Date(Date.UTC(2001, 0, doy));
      return shortDate({ year: 2001, month: d.getUTCMonth() + 1, day: d.getUTCDate(), doy, decade: 0 });
    };
    // Mediana circular simple: los DOY de siembra (jul–ene) se desplazan para no partir el año
    const shift = (x: number) => (x < 182 ? x + 365 : x);
    const med = (xs: number[]) => (xs.length ? ((Math.round(percentile(xs.map(shift), 0.5)) - 1) % 365) + 1 : null);
    const ms = med(sows), mh = med(harvs);
    return { campaign: campaignLabel(firstCampaign + s), crop, cropName: nameOf(crop, crops), sowing: ms ? doyLabel(ms) : null, harvest: mh ? doyLabel(mh) : null };
  });
}

/** Agrega indicadores de varias parcelas ponderando por área. */
export function aggregateIndicators(list: { ind: Record<IndicatorId, IndicatorValue>; area: number }[]): Record<IndicatorId, IndicatorValue> {
  const total = list.reduce((s, x) => s + x.area, 0) || 1;
  const out = {} as Record<IndicatorId, IndicatorValue>;
  for (const { id } of INDICATORS) {
    const first = list[0]!.ind[id];
    const w = (f: (v: IndicatorValue) => number) => list.reduce((s, x) => s + f(x.ind[id]) * x.area, 0) / total;
    out[id] = { ...first, mean: w((v) => v.mean), p10: w((v) => v.p10), p90: w((v) => v.p90), robust: w((v) => v.robust), score: w((v) => v.score), ...(first.range ? { range: [w((v) => v.range![0]), w((v) => v.range![1])] as [number, number] } : {}) };
  }
  return out;
}

const fmt = (id: IndicatorId, v: number) => {
  switch (id) {
    case 'water': return `${Math.round(v)} mm de déficit`;
    case 'climateRisk': return `${Math.round(v * 100)} % de campañas con pérdida`;
    case 'organicMatter': return `${round(v, 1)} t/ha de MO`;
    case 'nitrogen': return `${Math.round(v)} kg N/ha`;
    case 'erosion': return `${round(v, 1)} t/ha/año`;
    case 'pestHealth': return `riesgo ${round(v, 2)}`;
    case 'income': return `S/ ${Math.round(v).toLocaleString('es-PE')} por ha`;
    case 'forage': return `${Math.round(v).toLocaleString('es-PE')} kg MS/ha`;
  }
};
const LABEL = Object.fromEntries(INDICATORS.map((i) => [i.id, i.label])) as Record<IndicatorId, string>;

export function compareText(from: Record<IndicatorId, IndicatorValue>, to: Record<IndicatorId, IndicatorValue>, threshold = 0.04): { better: string[]; worse: string[] } {
  const better: string[] = [], worse: string[] = [];
  for (const { id } of INDICATORS) {
    const d = to[id].score - from[id].score;
    const txt = `${LABEL[id]}: de ${fmt(id, from[id].mean)} a ${fmt(id, to[id].mean)}${to[id].provenance === 'assumed' ? ' (supuesto)' : ''}`;
    if (d > threshold) better.push(txt);
    else if (d < -threshold) worse.push(txt);
  }
  return { better, worse };
}

export function topCoins(coins: Record<IndicatorId, number>): string {
  return (Object.entries(coins) as [IndicatorId, number][]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${LABEL[k]} (${v})`).join(', ');
}

/** Riesgos que necesitan revisión local (spec §8.2): aptitud marginal, cobertura que consume agua, N supuesto. */
export function risksFor(m: ParcelModel, r: Rotation, st: RotationStats, apt: Map<string, AptitudeResult>, crops: Record<string, CropCard>, pestRisk: number[]): string[] {
  const out: string[] = [];
  for (const id of new Set(r)) {
    const ap = apt.get(id);
    if (ap?.aptitude === 'marginal') out.push(`${nameOf(id, crops)} (${m.name}): ${ap.reasons.join(' ')}`);
  }
  r.forEach((id, s) => {
    const c = crops[id];
    if (c?.coverCrop && s < 2 && r[s + 1] !== FALLOW.id) {
      const ets = m.campaigns.map((y) => season(m, id, y, 'descanso').et);
      out.push(`${c.name} protege el suelo, pero consume ~${Math.round(mean(ets))} mm de agua en su campaña antes de ${nameOf(r[s + 1]!, crops)}. En años secos eso puede aumentar el déficit.`);
    }
  });
  const legumes = [...new Set(r.filter((id) => crops[id]?.fixesN))];
  for (const id of legumes) {
    const c = crops[id]!;
    out.push(`Del N fijado por ${c.name.toLowerCase()}, solo una parte queda para el siguiente cultivo (${c.nCredit_estimated_kgha[0]}–${c.nCredit_estimated_kgha[1]} kg/ha, supuesto). Depende de los residuos y el manejo.`);
  }
  if (Math.max(...pestRisk) > 0.5) out.push('Riesgo alto de plagas por repetir la misma familia o por vecinos con el mismo cultivo. El umbral exacto depende de la plaga y se desconoce para esta comunidad.');
  const late = r.map((id, s) => ({ id, s })).filter(({ id }) => id !== FALLOW.id);
  for (const { id } of late) {
    const lates = m.campaigns.filter((y) => season(m, id, y, 'descanso').lateSowing).length;
    if (lates / m.campaigns.length > 0.3) out.push(`${nameOf(id, crops)}: en ${lates} de ${m.campaigns.length} campañas no hubo lluvia suficiente para sembrar a tiempo${m.irrigated ? '' : ' sin riego'}.`);
  }
  if (st.ruinProb > 0.1) out.push(`En ${Math.round(st.ruinProb * 100)} % de las campañas simuladas el rendimiento habría caído a menos del 30 %.`);
  return [...new Set(out)];
}
