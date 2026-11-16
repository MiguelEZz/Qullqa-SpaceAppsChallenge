import type { Assumptions } from './assumptions.ts';

type Ind = 'water' | 'climateRisk' | 'organicMatter' | 'nitrogen' | 'erosion' | 'pestHealth' | 'income' | 'forage';
export type FocusId = 'money' | 'safeHarvest' | 'goodLand' | 'animals';

/**
 * «¿Qué te importa más?» → pesos (10 monedas) para el motor. El agricultor elige 1–2 tarjetas en sus palabras;
 * aquí se traducen a los 8 indicadores y se ajustan con lo que ya contó (animales, destino, riego).
 * Es un SUPUESTO: la app se lo dice y le deja ajustar en detalle. El reparto (Shapley/ayni) no depende de esto.
 */
export function coinsFromFocus(
  focus: FocusId[],
  ctx: { livestockHeads: number; market: string; hasRainfedParcel: boolean },
  a: Assumptions,
): Record<Ind, number> {
  const P = a.priorities;
  const w: Record<Ind, number> = { water: P.base, climateRisk: P.base, organicMatter: P.base, nitrogen: P.base, erosion: P.base, pestHealth: P.base, income: P.base, forage: P.base };
  const share = focus.length > 1 ? P.secondCardShare : 1;
  focus.forEach((f, i) => {
    for (const [k, v] of Object.entries(P.cards[f])) w[k as Ind] += (v as number) * (i === 0 ? 1 : share);
  });
  if (ctx.livestockHeads > 0) w.forage += ctx.livestockHeads >= P.adjust.manyLivestock ? P.adjust.livestockMany : P.adjust.livestockSome;
  if (ctx.market === 'autoconsumo') w.climateRisk += P.adjust.homeConsumptionSafety;
  if (ctx.market === 'feria_local' || ctx.market === 'intermediario') w.income += P.adjust.sellsIncome;
  if (ctx.hasRainfedParcel) w.water += P.adjust.rainfedWater;
  // A enteros que suman 10 (mayor resto), sin dejar en 0 lo que el agricultor eligió
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  const raw = Object.entries(w).map(([k, v]) => ({ k: k as Ind, v: (v / total) * 10 }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)])) as Record<Ind, number>;
  let left = 10 - Object.values(out).reduce((s, v) => s + v, 0);
  for (const r of [...raw].sort((x, y) => (y.v - Math.floor(y.v)) - (x.v - Math.floor(x.v)))) { if (left <= 0) break; out[r.k]++; left--; }
  return out;
}
