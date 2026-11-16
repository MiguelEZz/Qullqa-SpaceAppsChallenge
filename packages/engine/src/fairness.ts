import type { Assumptions } from '@qullqa/catalog';
import { type Community, type Plan, evaluatePlan } from './community.ts';
import { mulberry32 } from './util.ts';

/**
 * Reparto justo del excedente con Shapley (spec §8.3 paso 3). El valor usa efectos MEDIBLES
 * (soles equivalentes: margen + fertilizante N evitado), no los pesos declarados: así no conviene mentir.
 *   v(S) = Σ_{i∈S} [M_i(S coordina, el resto en su plan individual) − M_i(todos en plan individual)]
 */
export interface ShapleyResult {
  method: 'exact' | 'permutations';
  samples: number;
  /** Excedente total E = v(N) (S/ por campaña). */
  surplus: number;
  phi: number[];
  /** Ganancia real de cada uno con el plan comunitario frente a su plan individual. */
  gain: number[];
  /** Compensación (suma cero): φ_i − ganancia_i. Positivo = recibe, negativo = aporta. */
  transfer: number[];
  provenance: 'simulated';
}

export function shapley(c: Community, solo: Plan, community: Plan, a: Assumptions, seed: number): ShapleyResult {
  const n = c.players.length;
  const base = evaluatePlan(c, solo).money;
  const memo = new Map<number, number>();
  const v = (mask: number): number => {
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    const plan = c.parcels.map((_, p) => ((mask >> c.owner[p]!) & 1 ? community[p]! : solo[p]!));
    const m = evaluatePlan(c, plan).money;
    let val = 0;
    for (let i = 0; i < n; i++) if ((mask >> i) & 1) val += m[i]! - base[i]!;
    memo.set(mask, val);
    return val;
  };
  const full = n ? (1 << n) - 1 : 0;
  const phi = new Array<number>(n).fill(0);
  let method: ShapleyResult['method'] = 'exact';
  let samples = 0;
  if (n <= a.community.shapleyExactMax) {
    const fact = [1];
    for (let k = 1; k <= n; k++) fact[k] = fact[k - 1]! * k;
    for (let i = 0; i < n; i++)
      for (let S = 0; S <= full; S++) {
        if ((S >> i) & 1) continue;
        let size = 0;
        for (let t = S; t; t &= t - 1) size++;
        phi[i]! += ((fact[size]! * fact[n - size - 1]!) / fact[n]!) * (v(S | (1 << i)) - v(S));
      }
  } else {
    method = 'permutations';
    samples = a.community.shapleySamples;
    const rnd = mulberry32(seed);
    for (let k = 0; k < samples; k++) {
      const order = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
      let S = 0;
      for (const i of order) { const before = v(S); S |= 1 << i; phi[i]! += (v(S) - before) / samples; }
    }
  }
  const comm = evaluatePlan(c, community).money;
  const gain = comm.map((m, i) => m - base[i]!);
  const surplus = v(full);
  // En muestreo, ajusta para que el reparto sume exactamente el excedente
  if (method === 'permutations' && n) {
    const s = phi.reduce((x, y) => x + y, 0);
    const fix = (surplus - s) / n;
    for (let i = 0; i < n; i++) phi[i]! += fix;
  }
  const transfer = phi.map((p, i) => p - gain[i]!);
  return { method, samples, surplus, phi, gain, transfer, provenance: 'simulated' };
}

/** Compensación en ayni (spec §8.3 paso 4): expresa la transferencia en jornales de mink'a. */
export function ayni(transfer: number[], a: Assumptions): { soles: number; jornales: number; direction: 'recibe' | 'aporta' | 'nada' }[] {
  return transfer.map((t) => ({
    soles: Math.round(t),
    jornales: Math.round((Math.abs(t) / a.money.jornal_soles) * 10) / 10,
    direction: Math.abs(t) < a.money.jornal_soles / 2 ? 'nada' : t > 0 ? 'recibe' : 'aporta',
  }));
}
