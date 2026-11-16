import type { Assumptions, CropCard } from '@qullqa/catalog';
import { FALLOW } from '@qullqa/catalog';
import type { IndicatorId, Provenance } from '@qullqa/shared';
import { type Dist, type RotationStats, summarize } from './rotation.ts';
import { clamp } from './util.ts';

/**
 * Los 8 indicadores (spec §7) con las correcciones §15.10 (p20 / p80) y §15.11 (umbrales fijos).
 */
export interface IndicatorValue {
  id: IndicatorId;
  /** Promedio en las campañas simuladas, en su unidad. */
  mean: number;
  p10: number;
  p90: number;
  /** Valor «prudente»: 0,6·media + 0,4·p20 (positivos) o 0,6·media + 0,4·p80 (negativos). */
  robust: number;
  /** Puntaje 0–1 (1 = mejor) con umbrales agronómicos fijos. */
  score: number;
  unit: string;
  provenance: Provenance;
  /** Rango cuando el valor es un supuesto (N). */
  range?: [number, number];
}

export const INDICATOR_UNITS: Record<IndicatorId, string> = {
  water: 'mm de déficit por campaña', climateRisk: 'probabilidad de perder la cosecha', organicMatter: 't/ha de MO en 3 campañas',
  nitrogen: 'kg N/ha (rango supuesto)', erosion: 't/ha/año', pestHealth: 'índice de riesgo 0–1', income: 'S/ por ha y campaña', forage: 'kg MS/ha por campaña',
};

/** Contexto comunitario de una parcela: lo que depende de los vecinos. */
export interface ParcelContext {
  /** Multiplicador de precio por temporada (sobreoferta local, spec §8.1). */
  priceMult: [number, number, number];
  /** Riesgo de plaga por temporada (índice de continuidad, spec §15.9). */
  pestRisk: [number, number, number];
}

const posR = (d: Dist) => 0.6 * d.mean + 0.4 * d.p20;
const negR = (d: Dist) => 0.6 * d.mean + 0.4 * d.p80;
const pub = (d: Dist) => ({ mean: d.mean, p10: d.p10, p90: d.p90 });

/** Margen por año (S/ por ha y campaña) con el precio ajustado por el mercado local. */
export function marginsByYear(s: RotationStats, priceMult: [number, number, number]): number[] {
  const n = s.years.length;
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    let m = 0;
    for (let t = 0; t < 3; t++) m += priceMult[t]! * s.revenue[k * 3 + t]! - s.cost[t]!;
    out[k] = m / 3;
  }
  return out;
}

/** Distribución del ingreso: precalculada si no hay caída de precio; si no, se recalcula. */
export function incomeDist(s: RotationStats, priceMult: [number, number, number]): Dist {
  return priceMult[0] === 1 && priceMult[1] === 1 && priceMult[2] === 1 ? s.dist.incomeBase : summarize(marginsByYear(s, priceMult));
}

export function computeIndicators(s: RotationStats, ctx: ParcelContext, a: Assumptions): Record<IndicatorId, IndicatorValue> {
  const N = a.normalization;
  const D = s.dist;
  const inc = incomeDist(s, ctx.priceMult);
  // Plagas: promedio de las campañas con cultivo (el beneficio del descanso ya baja el riesgo del cultivo siguiente)
  const cropped = [0, 1, 2].filter((t) => s.rotation[t] !== FALLOW.id);
  const pest = cropped.length ? cropped.reduce((acc, t) => acc + ctx.pestRisk[t]!, 0) / cropped.length : 0;
  const nMid = (s.nCredit[0] + s.nCredit[1]) / 2;
  const mk = (id: IndicatorId, d: { mean: number; p10: number; p90: number }, robust: number, score: number, provenance: Provenance, range?: [number, number]): IndicatorValue =>
    ({ id, ...d, robust, score: clamp(score), unit: INDICATOR_UNITS[id], provenance, ...(range ? { range } : {}) });

  const wR = negR(D.deficit), eR = negR(D.erosion), oR = posR(D.om), iR = posR(inc), fR = posR(D.forage);
  return {
    water: mk('water', pub(D.deficit), wR, 1 - wR / N.deficit_mm_worst, 'simulated'),
    climateRisk: mk('climateRisk', { mean: s.lossProb, p10: s.lossProb, p90: s.lossProb }, s.lossProb, 1 - s.lossProb / N.lossProb_worst, 'simulated'),
    organicMatter: mk('organicMatter', pub(D.om), oR, (oR - N.om_tha_worst) / (N.om_tha_best - N.om_tha_worst), 'simulated'),
    nitrogen: mk('nitrogen', { mean: nMid, p10: s.nCredit[0], p90: s.nCredit[1] }, nMid, nMid / N.nitrogen_kgha_best, 'assumed', s.nCredit),
    erosion: mk('erosion', pub(D.erosion), eR, 1 - eR / N.erosion_tha_worst, 'simulated'),
    pestHealth: mk('pestHealth', { mean: pest, p10: Math.min(...ctx.pestRisk), p90: Math.max(...ctx.pestRisk) }, pest, 1 - pest / N.pest_worst, 'assumed'),
    income: mk('income', pub(inc), iR, (iR - N.income_worst_soles_ha) / (N.income_best_soles_ha - N.income_worst_soles_ha), 'simulated'),
    forage: mk('forage', pub(D.forage), fR, fR / N.forage_kgDMha_best, 'simulated'),
  };
}

/** U_i = Σ w_k · s_k con las 10 monedas (spec §7). */
export function utility(ind: Record<IndicatorId, IndicatorValue>, coins: Record<IndicatorId, number>): number {
  let u = 0;
  for (const k of Object.keys(coins) as IndicatorId[]) u += (coins[k] / 10) * ind[k].score;
  return u;
}

// ───────────── Índice de continuidad de hospederos (spec §15.9) ─────────────

export function familyOf(id: string, crops: Record<string, CropCard>): string | null {
  return id === FALLOW.id ? null : crops[id]?.family ?? null;
}

/**
 * Riesgo por temporada: repetición de la misma familia en la parcela (historia + plan) y fracción
 * de vecinos con la misma familia en la misma temporada. El aumento no lineal alrededor del umbral
 * es un CONCEPTO (supuesto): el umbral real depende de la plaga y se desconoce para esta comunidad.
 */
export function pestRiskSeries(history: string[], plan: string[], neighborPlans: string[][], crops: Record<string, CropCard>, a: Assumptions): [number, number, number] {
  const seq = [...history, ...plan];
  const out: number[] = [];
  for (let s = 0; s < 3; s++) {
    const idx = history.length + s;
    const fam = familyOf(seq[idx]!, crops);
    if (!fam) { out.push(0); continue; }
    let k = 0;
    for (let j = idx - 1; j >= 0 && familyOf(seq[j]!, crops) === fam; j--) k++;
    const own = a.pests.baseRisk + (1 - a.pests.baseRisk) * (1 - Math.exp(-a.pests.repeatFactor * k));
    const f = neighborPlans.length ? neighborPlans.filter((np) => familyOf(np[s]!, crops) === fam).length / neighborPlans.length : 0;
    const g = f > 0 ? 1 / (1 + Math.exp(-12 * (f - a.pests.percolationThreshold))) : 0;
    out.push(clamp(1 - (1 - own) * (1 - a.pests.neighborWeight * g)));
  }
  return out as [number, number, number];
}

/** Precio con elasticidad: p = p0 · (Q/Q0)^(−1/ε) solo cuando hay sobreoferta (Q > Q0). Supuesto. */
export function priceMultiplier(totalHa: number, a: Assumptions): number {
  return totalHa <= a.market.referenceHa ? 1 : (totalHa / a.market.referenceHa) ** (-1 / a.market.elasticity);
}
