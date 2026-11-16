import { FALLOW } from '@qullqa/catalog';
import { type ParcelModel, season } from './parcel.ts';
import type { SeasonResult } from './water.ts';
import { mean, percentile } from './util.ts';

/** Resumen de una distribución (precalculado: no depende de los vecinos). */
export interface Dist { mean: number; p10: number; p20: number; p80: number; p90: number }
export const summarize = (xs: ArrayLike<number>): Dist => {
  const a = Array.from(xs);
  return { mean: mean(a), p10: percentile(a, 0.1), p20: percentile(a, 0.2), p80: percentile(a, 0.8), p90: percentile(a, 0.9) };
};

export type Rotation = [string, string, string];
export const rotKey = (r: Rotation) => r.join('>');

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/**
 * Resultado de una rotación (3 campañas) en cada año histórico de inicio (spec §7).
 * Solo contiene lo que NO depende de los vecinos; precio y plagas se aplican después.
 */
export interface RotationStats {
  rotation: Rotation;
  /** Años de inicio con las 3 campañas completas. */
  years: number[];
  /** [año][temporada] → Yrel (0–1). */
  yrel: Float32Array;
  /** [año][temporada] → ingreso bruto a precio base (S/ por ha). */
  revenue: Float32Array;
  cost: [number, number, number];
  /** Por año de inicio (promedio por campaña). */
  deficit: Float32Array;
  irrigation: Float32Array;
  erosion: Float32Array;
  /** Balance de MO acumulado en las 3 campañas (t/ha). */
  om: Float32Array;
  forage: Float32Array;
  /** Crédito de N dejado por leguminosas en la rotación (kg/ha, rango supuesto). */
  nCredit: [number, number];
  /** Fracción de campañas con cultivo en que Yrel < 0,5 (pérdida) y < 0,3 (ruina). */
  lossProb: number;
  ruinProb: number;
  /** Años de inicio en que alguna campaña tuvo pérdida. */
  failYears: number;
  /** Riego bruto medio por década del año (mm por campaña). */
  irrigationByDecade: Float32Array;
  /** Resultados por campaña de años El Niño (temporada 1 iniciada ese año), si hay datos. */
  byCampaign: Map<number, SeasonResult>;
  /** Distribuciones precalculadas (deficit, erosion, om, forage e ingreso a precio base). */
  dist: { deficit: Dist; erosion: Dist; om: Dist; forage: Dist; incomeBase: Dist };
}

/** Simula una rotación sobre todos los años disponibles. `prev0` = último cultivo real (historia). */
export function rotationStats(m: ParcelModel, rot: Rotation, prev0: string): RotationStats {
  const ys = m.campaigns;
  const set = new Set(ys);
  const years = ys.filter((y) => set.has(y + 1) && set.has(y + 2));
  const n = years.length;
  const yrel = new Float32Array(n * 3), revenue = new Float32Array(n * 3);
  const deficit = new Float32Array(n), irrigation = new Float32Array(n), erosion = new Float32Array(n), om = new Float32Array(n), forage = new Float32Array(n);
  const irrigationByDecade = new Float32Array(36);
  const a = m.a;
  const omStock = ((m.soil?.value.omPct ?? 2.6) / 100) * a.organicMatter.soilMass_tha;
  const crops = rot.map((id) => (id === FALLOW.id ? null : m.crops[id]!));
  const cost = crops.map((c) => (c ? mid(c.costRange_soles_ha) : 0)) as [number, number, number];
  let cropSeasons = 0, losses = 0, ruins = 0, failYears = 0;

  for (let k = 0; k < n; k++) {
    const y = years[k]!;
    let fail = false;
    let d = 0, dn = 0, irr = 0, ero = 0, o = 0, f = 0;
    for (let s = 0; s < 3; s++) {
      const prev = s === 0 ? prev0 : rot[s - 1]!;
      const r = season(m, rot[s]!, y + s, prev);
      const c = crops[s];
      yrel[k * 3 + s] = r.yrel;
      irr += r.irrigation; ero += r.erosion_tha;
      // Déficit de agua solo de las campañas CON cultivo: un descanso no «ahorra» agua de una cosecha que no existe
      if (c) { d += r.deficit; dn++; }
      for (let dec = 0; dec < 36; dec++) irrigationByDecade[dec]! += r.irrigationByDecade[dec]! / (3 * n);
      if (c) {
        revenue[k * 3 + s] = r.yrel * mid(c.yieldPotential_kgha) * mid(c.priceRange_soles_kg);
        cropSeasons++;
        if (r.yrel < 0.5) { losses++; fail = true; }
        if (r.yrel < 0.3) ruins++;
        const residue = mid(c.residue_tha) * (0.3 + 0.7 * r.yrel);
        o += a.organicMatter.humification * residue - a.organicMatter.mineralization * omStock * (a.organicMatter.tillageFactor[c.family] ?? 1);
        // El forraje crece con el cultivo: se escala con Yrel
        f += mid(c.forage_kgDMha) * r.yrel;
      } else {
        o += a.organicMatter.humification * mid(FALLOW.residue_tha) - a.organicMatter.mineralization * omStock * (a.organicMatter.tillageFactor.ninguna ?? 0.5);
        f += mid(FALLOW.forage_kgDMha);
      }
    }
    if (fail) failYears++;
    deficit[k] = dn ? d / dn : a.normalization.deficit_mm_worst; irrigation[k] = irr / 3; erosion[k] = ero / 3; om[k] = o; forage[k] = f / 3;
  }

  // Crédito de N: lo que deja cada leguminosa al cultivo siguiente (incluye el que sigue a la rotación)
  const nCredit: [number, number] = [0, 0];
  for (const c of crops) if (c?.fixesN) { nCredit[0] += c.nCredit_estimated_kgha[0]; nCredit[1] += c.nCredit_estimated_kgha[1]; }

  const byCampaign = new Map<number, SeasonResult>();
  for (const y of m.campaigns) byCampaign.set(y, season(m, rot[0], y, prev0));

  const incomeBase = new Float32Array(n);
  for (let k = 0; k < n; k++) incomeBase[k] = (revenue[k * 3]! + revenue[k * 3 + 1]! + revenue[k * 3 + 2]! - cost[0] - cost[1] - cost[2]) / 3;
  const dist = { deficit: summarize(deficit), erosion: summarize(erosion), om: summarize(om), forage: summarize(forage), incomeBase: summarize(incomeBase) };

  return {
    dist,
    rotation: rot, years, yrel, revenue, cost, deficit, irrigation, erosion, om, forage, nCredit,
    // Sin ningún cultivo no hay cosecha: se cuenta como pérdida segura, no como «sin riesgo»
    lossProb: cropSeasons ? losses / cropSeasons : 1, ruinProb: cropSeasons ? ruins / cropSeasons : 1,
    failYears, irrigationByDecade, byCampaign,
  };
}

/**
 * Rotaciones candidatas de 3 campañas. Aplica reglas de rotación (supuesto editable): pocas campañas de descanso
 * y no repetir el mismo cultivo más de N campañas seguidas, contando la campaña en curso (`prev`).
 */
export function enumerateRotations(allowed: string[], rules?: { maxFallowSeasons: number; maxSameCropInRow: number; fallowId: string }, prev?: string | null): Rotation[] {
  const out: Rotation[] = [];
  for (const a of allowed) for (const b of allowed) for (const c of allowed) {
    const r: Rotation = [a, b, c];
    if (rules) {
      if (r.filter((x) => x === rules.fallowId).length > rules.maxFallowSeasons) continue;
      const seq = prev ? [prev, ...r] : r;
      let run = 1, ok = true;
      for (let i = 1; i < seq.length && ok; i++) {
        run = seq[i] === seq[i - 1] && seq[i] !== rules.fallowId ? run + 1 : 1;
        if (run > rules.maxSameCropInRow) ok = false;
      }
      if (!ok) continue;
    }
    out.push(r);
  }
  return out.length ? out : [[rules?.fallowId ?? allowed[0]!, allowed[0]!, allowed[0]!] as Rotation];
}
