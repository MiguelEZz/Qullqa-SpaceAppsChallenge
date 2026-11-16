import type { Assumptions } from '@qullqa/catalog';
import { FALLOW } from '@qullqa/catalog';
import type { Constraints, IndicatorId } from '@qullqa/shared';
import { type IndicatorValue, computeIndicators, familyOf, incomeDist, pestRiskSeries, priceMultiplier, utility } from './indicators.ts';
import type { ParcelModel } from './parcel.ts';
import { type Rotation, type RotationStats, rotKey, rotationStats } from './rotation.ts';
import { mean, mulberry32 } from './util.ts';

export interface Player {
  userId: string;
  coins: Record<IndicatorId, number>;
  constraints: Constraints;
  vetoes: string[];
  parcels: ParcelModel[];
}

/** Índices: parcela global → jugador, y rotaciones candidatas por parcela. */
export interface Community {
  players: Player[];
  parcels: ParcelModel[];
  owner: number[];
  /** Vecinos (simétricos) por índice de parcela. */
  neighbors: number[][];
  /** Rotaciones candidatas por parcela (aptas/marginales, sin vetos). */
  candidates: Rotation[][];
  statusQuo: Rotation[];
  a: Assumptions;
  stats: (p: number, r: Rotation) => RotationStats;
  /** Escenario «brote en parcela X» (índice de parcela) o -1. */
  outbreak: number;
}

export type Plan = Rotation[];

export function buildCommunity(players: Player[], candidatesByParcel: Map<string, Rotation[]>, a: Assumptions, outbreakParcelId?: string): Community {
  const parcels = players.flatMap((p) => p.parcels);
  const owner = players.flatMap((p, i) => p.parcels.map(() => i));
  const idx = new Map(parcels.map((p, i) => [p.id, i]));
  const neighbors = parcels.map(() => new Set<number>());
  parcels.forEach((p, i) => p.neighborIds.forEach((nid) => {
    const j = idx.get(nid);
    if (j !== undefined && j !== i) { neighbors[i]!.add(j); neighbors[j]!.add(i); }
  }));
  const cache = parcels.map(() => new Map<string, RotationStats>());
  const stats = (p: number, r: Rotation) => {
    const k = rotKey(r);
    let s = cache[p]!.get(k);
    if (!s) { s = rotationStats(parcels[p]!, r, parcels[p]!.currentRotation[2]); cache[p]!.set(k, s); }
    return s;
  };
  return {
    players, parcels, owner, neighbors: neighbors.map((s) => [...s].sort((x, y) => x - y)),
    candidates: parcels.map((p) => candidatesByParcel.get(p.id) ?? [p.currentRotation]),
    statusQuo: parcels.map((p) => p.currentRotation), a, stats,
    outbreak: outbreakParcelId ? (idx.get(outbreakParcelId) ?? -1) : -1,
  };
}

// ───────────── Evaluación de un plan ─────────────

export interface ParcelEval { indicators: Record<IndicatorId, IndicatorValue>; utility: number; money: number; priceMult: [number, number, number]; pestRisk: [number, number, number] }
export interface PlanEval {
  parcels: ParcelEval[];
  /** U_i: promedio de utilidad de sus parcelas ponderado por área. */
  U: number[];
  /** Valor en soles equivalentes por jugador: margen + fertilizante N evitado. */
  money: number[];
  penalties: { pests: number; water: number; market: number; erosion: number };
  metrics: CommunityMetrics;
}

export interface CommunityMetrics {
  /** Riesgo medio de plagas (índice de continuidad). */
  meanPestRisk: number;
  /** Pico de riego comunal (m³ en la década más demandada). */
  waterPeak_m3: number;
  /** Caída media de precio por sobreoferta (0 = sin caída). */
  meanPriceDrop: number;
  /** Erosión que llega desde parcelas de arriba (t/año). */
  downstreamErosion_t: number;
  /** Probabilidad media de ruina (Yrel < 0,3). */
  ruinProb: number;
  totalMoney: number;
}

function areaByCrop(c: Community, plan: Plan): Map<string, number>[] {
  const ha: Map<string, number>[] = [new Map(), new Map(), new Map()];
  plan.forEach((r, p) => r.forEach((crop, s) => { if (crop !== FALLOW.id) ha[s]!.set(crop, (ha[s]!.get(crop) ?? 0) + c.parcels[p]!.areaHa); }));
  return ha;
}

function parcelEval(c: Community, plan: Plan, p: number, ha: Map<string, number>[]): { ev: ParcelEval; st: RotationStats } {
  const a = c.a;
  const r = plan[p]!;
  const st = c.stats(p, r);
  const priceMult = r.map((crop, s) => (crop === FALLOW.id ? 1 : priceMultiplier(ha[s]!.get(crop) ?? 0, a))) as [number, number, number];
  let pestRisk = pestRiskSeries(c.parcels[p]!.currentRotation, r, c.neighbors[p]!.map((j) => plan[j]!), c.parcels[p]!.crops, a);
  if (c.outbreak === p) pestRisk = [1, 1, 1];
  else if (c.outbreak >= 0 && c.neighbors[p]!.includes(c.outbreak)) {
    const src = plan[c.outbreak]!, crops = c.parcels[p]!.crops;
    pestRisk = pestRisk.map((x, s) => (familyOf(r[s]!, crops) && familyOf(r[s]!, crops) === familyOf(src[s]!, crops) ? 1 - (1 - x) * (1 - a.pests.neighborWeight) : x)) as [number, number, number];
  }
  const indicators = computeIndicators(st, { priceMult, pestRisk }, a);
  const pl = c.players[c.owner[p]!]!;
  const nMid = (st.nCredit[0] + st.nCredit[1]) / 2;
  const money = c.parcels[p]!.areaHa * (incomeDist(st, priceMult).mean + nMid * a.money.nPrice_soles_kg);
  return { ev: { indicators, utility: utility(indicators, pl.coins), money, priceMult, pestRisk }, st };
}

/** U_i sin evaluar a toda la comunidad: solo sus parcelas (mercado y vecinos según el plan). */
export function playerUtility(c: Community, plan: Plan, i: number): number {
  const ha = areaByCrop(c, plan);
  let u = 0, area = 0;
  for (let p = 0; p < c.parcels.length; p++) {
    if (c.owner[p] !== i) continue;
    u += parcelEval(c, plan, p, ha).ev.utility * c.parcels[p]!.areaHa;
    area += c.parcels[p]!.areaHa;
  }
  return area > 0 ? u / area : 0;
}

export function evaluatePlan(c: Community, plan: Plan): PlanEval {
  const a = c.a;
  const n = c.parcels.length;
  const ha = areaByCrop(c, plan);
  const crops = c.parcels[0]?.crops ?? {};
  const parcels: ParcelEval[] = new Array(n);
  const stats: RotationStats[] = new Array(n);
  let dropSum = 0, dropN = 0;
  for (let p = 0; p < n; p++) {
    const { ev, st } = parcelEval(c, plan, p, ha);
    parcels[p] = ev;
    stats[p] = st;
    plan[p]!.forEach((crop, s) => { if (crop !== FALLOW.id) { dropSum += 1 - ev.priceMult[s]!; dropN++; } });
  }
  const U = c.players.map(() => 0), area = c.players.map(() => 0), money = c.players.map(() => 0);
  for (let p = 0; p < n; p++) {
    const i = c.owner[p]!;
    U[i]! += parcels[p]!.utility * c.parcels[p]!.areaHa;
    area[i]! += c.parcels[p]!.areaHa;
    money[i]! += parcels[p]!.money;
  }
  for (let i = 0; i < U.length; i++) U[i] = area[i]! > 0 ? U[i]! / area[i]! : 0;

  // Plagas: concentración de una familia por encima del umbral (concepto de percolación)
  const totalHa = c.parcels.reduce((s, p) => s + p.areaHa, 0) || 1;
  let pestPen = 0;
  for (let s = 0; s < 3; s++) {
    const fam = new Map<string, number>();
    plan.forEach((r, p) => { const f = familyOf(r[s]!, crops); if (f) fam.set(f, (fam.get(f) ?? 0) + c.parcels[p]!.areaHa); });
    const maxShare = Math.max(0, ...[...fam.values()].map((v) => v / totalHa));
    pestPen += Math.max(0, maxShare - a.pests.percolationThreshold) / 3;
  }
  // Agua: pico de la década más demandada frente al promedio (escalonar siembras aplana picos)
  const dem = new Float64Array(36);
  for (let p = 0; p < n; p++) for (let d = 0; d < 36; d++) dem[d]! += stats[p]!.irrigationByDecade[d]! * c.parcels[p]!.areaHa * 10;
  const peak = Math.max(...dem);
  const avg = dem.reduce((x, y) => x + y, 0) / 36;
  const waterPen = peak > 0 ? (peak - avg) / peak : 0;
  // Mercado: concentración (Herfindahl) del área sembrada por temporada
  let mkt = 0;
  for (let s = 0; s < 3; s++) {
    const tot = [...ha[s]!.values()].reduce((x, y) => x + y, 0);
    if (tot > 0) mkt += [...ha[s]!.values()].reduce((x, v) => x + (v / tot) ** 2, 0) / 3;
  }
  // Erosión cuenca abajo: suelo que baja de vecinos más altos (grafo por elevación)
  let down = 0;
  for (let i = 0; i < n; i++) for (const j of c.neighbors[i]!) {
    if (c.parcels[j]!.elevation.value > c.parcels[i]!.elevation.value + 5) down += parcels[j]!.indicators.erosion.robust * c.parcels[j]!.areaHa;
  }
  const erosionPen = Math.min(1, down / (totalHa * a.normalization.erosion_tha_worst));

  return {
    parcels, U, money,
    penalties: { pests: pestPen, water: waterPen, market: mkt, erosion: erosionPen },
    metrics: {
      meanPestRisk: mean(parcels.map((p) => mean(p.pestRisk))),
      waterPeak_m3: peak,
      meanPriceDrop: dropN ? dropSum / dropN : 0,
      downstreamErosion_t: down,
      ruinProb: mean(stats.map((s) => s.ruinProb)),
      totalMoney: money.reduce((x, y) => x + y, 0),
    },
  };
}

// ───────────── Restricciones duras ─────────────

export function laborCapacity(pl: Player, a: Assumptions): number {
  const k = pl.constraints;
  return Math.max(1, k.familyWorkers) * a.labor.daysPerWorker * (k.canGetExtraLabor ? a.labor.extraLaborFactor : 1);
}

export function laborNeed(pl: Player, rots: Rotation[], a: Assumptions): number {
  let worst = 0;
  for (let s = 0; s < 3; s++) {
    let need = 0;
    pl.parcels.forEach((p, k) => {
      const crop = rots[k]![s]!;
      if (crop === FALLOW.id) return;
      need += p.areaHa * ((a.labor.daysPerHa[crop] ?? 60) + (pl.constraints.traction === 'manual' ? a.labor.manualExtraDaysPerHa : 0));
    });
    worst = Math.max(worst, need);
  }
  return worst;
}

/** Capacidad efectiva: nunca menor a lo que ya hace hoy (su rotación actual es su realidad). */
export function laborOk(c: Community, i: number, plan: Plan): boolean {
  const pl = c.players[i]!;
  const idx = c.parcels.map((p, k) => (c.owner[k] === i ? k : -1)).filter((k) => k >= 0);
  const cap = Math.max(laborCapacity(pl, c.a), laborNeed(pl, idx.map((k) => c.statusQuo[k]!), c.a));
  return laborNeed(pl, idx.map((k) => plan[k]!), c.a) <= cap + 1e-9;
}

// ───────────── Línea base: mejor plan individual (spec §8.3 paso 1) ─────────────

/** Mejor plan de cada jugador con los vecinos «como están» (status quo). */
export function soloPlans(c: Community): { plan: Plan; Usolo: number[]; UsoloStatusQuo: number[] } {
  const solo: Plan = c.statusQuo.slice();
  const Usolo = c.players.map(() => 0);
  c.players.forEach((_, i) => {
    const mine = c.parcels.map((_, k) => k).filter((k) => c.owner[k] === i);
    const trial = c.statusQuo.slice();
    let best = playerUtility(c, trial, i);
    for (let pass = 0; pass < 2; pass++) {
      for (const k of mine) {
        let bestR = trial[k]!;
        for (const r of c.candidates[k]!) {
          trial[k] = r;
          if (!laborOk(c, i, trial)) continue;
          const u = playerUtility(c, trial, i);
          if (u > best + 1e-12) { best = u; bestR = r; }
        }
        trial[k] = bestR;
      }
    }
    for (const k of mine) solo[k] = trial[k]!;
    Usolo[i] = best;
  });
  // Línea base de la racionalidad individual: lo que cada uno obtiene si TODOS hacen su mejor plan
  // por separado (sin coordinar). Así el punto de partida del recocido siempre la cumple.
  const Ubase = evaluatePlan(c, solo).U;
  return { plan: solo, Usolo: Ubase, UsoloStatusQuo: Usolo };
}


// ───────────── Propuesta comunitaria: recocido simulado (spec §8.3 paso 2 + §15.12) ─────────────

export function welfare(c: Community, ev: PlanEval, Usolo: number[]): { W: number; violation: number } {
  const a = c.a.community;
  const n = c.players.length;
  const pen = ev.penalties;
  let violation = 0;
  ev.U.forEach((u, i) => { violation += Math.max(0, Usolo[i]! - u); });
  const W = ev.U.reduce((x, y) => x + y, 0)
    - n * (a.lambdaPests * pen.pests + a.lambdaWater * pen.water + a.lambdaMarket * pen.market + a.lambdaErosion * pen.erosion)
    - a.violationPenalty * violation;
  return { W, violation };
}

export interface AnnealResult { plan: Plan; eval: PlanEval; W: number; feasible: boolean; iterations: number; accepted: number }

export function anneal(c: Community, start: Plan, Usolo: number[], seed: number, iterations = c.a.community.annealIterations): AnnealResult {
  const rnd = mulberry32(seed);
  let cur = start.slice();
  let curEv = evaluatePlan(c, cur);
  let curW = welfare(c, curEv, Usolo);
  let best = { plan: cur.slice(), ev: curEv, W: curW.W, feasible: curW.violation < 1e-9 };
  const T0 = c.a.community.annealT0;
  let accepted = 0;
  const n = c.parcels.length;
  if (!n) return { plan: cur, eval: curEv, W: curW.W, feasible: true, iterations: 0, accepted: 0 };
  for (let it = 0; it < iterations; it++) {
    const T = T0 * (0.01 ** (it / iterations));
    const p = Math.floor(rnd() * n);
    const cands = c.candidates[p]!;
    let r: Rotation;
    if (rnd() < 0.5) {
      // Cambia una sola temporada a otra rotación candidata que difiere solo ahí
      const s = Math.floor(rnd() * 3);
      const opts = cands.filter((x) => x[(s + 1) % 3] === cur[p]![(s + 1) % 3] && x[(s + 2) % 3] === cur[p]![(s + 2) % 3] && x[s] !== cur[p]![s]);
      r = opts.length ? opts[Math.floor(rnd() * opts.length)]! : cands[Math.floor(rnd() * cands.length)]!;
    } else r = cands[Math.floor(rnd() * cands.length)]!;
    const next = cur.slice();
    next[p] = r;
    if (!laborOk(c, c.owner[p]!, next)) continue; // restricción dura
    const ev = evaluatePlan(c, next);
    const w = welfare(c, ev, Usolo);
    // Racionalidad individual DENTRO del recocido: un estado que deja a alguien peor que solo
    // solo se acepta si reduce la violación (para salir de un inicio inviable), nunca si la crea.
    if (w.violation > curW.violation + 1e-9) continue;
    const dW = w.W - curW.W;
    if (dW >= 0 || rnd() < Math.exp(dW / T)) {
      cur = next; curEv = ev; curW = w; accepted++;
      const feasible = w.violation < 1e-9;
      if ((feasible && !best.feasible) || (feasible === best.feasible && w.W > best.W)) best = { plan: cur.slice(), ev, W: w.W, feasible };
    }
  }
  return { plan: best.plan, eval: best.ev, W: best.W, feasible: best.feasible, iterations, accepted };
}

/** Curva de cooperación (spec §11): % de familias que coordinan vs riesgo medio de plagas. */
export function cooperationCurve(c: Community, solo: Plan, community: Plan, seed: number, orders = 30): { cooperation: number; pestRisk: number; highRiskParcels: number }[] {
  const n = c.players.length;
  const rnd = mulberry32(seed);
  const acc = Array.from({ length: n + 1 }, () => ({ risk: 0, high: 0 }));
  for (let o = 0; o < orders; o++) {
    const order = c.players.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
    const inS = new Set<number>();
    for (let k = 0; k <= n; k++) {
      if (k > 0) inS.add(order[k - 1]!);
      const plan = c.parcels.map((_, p) => (inS.has(c.owner[p]!) ? community[p]! : solo[p]!));
      const ev = evaluatePlan(c, plan);
      acc[k]!.risk += ev.metrics.meanPestRisk / orders;
      acc[k]!.high += ev.parcels.filter((x) => Math.max(...x.pestRisk) > 0.5).length / Math.max(1, c.parcels.length) / orders;
    }
  }
  return acc.map((x, k) => ({ cooperation: n ? k / n : 0, pestRisk: x.risk, highRiskParcels: x.high }));
}
