/**
 * Estudio de simulación para la presentación: N comunidades sintéticas sobre las 20 chacras REALES de Yanque.
 * Cambian familias, prioridades, rotación actual (papa dominante), riego y destino de la cosecha.
 * Mide por familia: ingreso por campaña con lo de hoy, con su mejor plan solo y con el plan coordinado.
 *   pnpm -F @qullqa/engine exec tsx scripts/simulate-communities.ts [N=12]
 * TODO es simulación con clima pasado (no predicción comprobada).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ASSUMPTIONS as A0, CROPS, coinsFromFocus, type FocusId } from '@qullqa/catalog';
import type { EngineInput, ValleyDataset } from '@qullqa/shared';
import { makeSnapshot, mulberry32, runCommunity } from '../src/index.ts';

const N = Number(process.argv[2] ?? 12);
// Escenario de mercado: REF_HA = hectáreas de cada cultivo que absorbe el mercado sin bajar el precio (supuesto)
const REF_HA = Number(process.env.REF_HA ?? A0.market.referenceHa);
const A = { ...A0, market: { ...A0.market, referenceHa: REF_HA } };
const OUT = process.env.OUT ?? 'simulacion-comunidades.json';
const valley = JSON.parse(readFileSync(new URL('../../data/fixtures/colca.json', import.meta.url), 'utf8')) as ValleyDataset;
const FIELDS = (JSON.parse(readFileSync(new URL('../../../apps/api/src/demo/fields.json', import.meta.url), 'utf8')) as { fields: { key: string; ring: [number, number][]; elevationM: number }[] }).fields;

// Área (ha) y vecinos (≤ 50 m) de cada chacra, en proyección local
const M = (p: [number, number]) => [p[0] * 107_200, p[1] * 110_574] as const;
const area = (r: [number, number][]) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = M(r[i]!), [x2, y2] = M(r[(i + 1) % r.length]!); s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2 / 10_000; };
const bbox = (r: [number, number][]) => { const xs = r.map((p) => M(p)[0]), ys = r.map((p) => M(p)[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const gap = (a: number[], b: number[]) => Math.hypot(Math.max(0, b[0]! - a[2]!, a[0]! - b[2]!), Math.max(0, b[1]! - a[3]!, a[1]! - b[3]!));
const boxes = FIELDS.map((f) => bbox(f.ring));
const neighbors = FIELDS.map((_, i) => FIELDS.map((_, j) => j).filter((j) => j !== i && gap(boxes[i]!, boxes[j]!) <= 50));

// Rotaciones actuales típicas del Colca (la papa domina)
const CURRENT: [string, string, string][] = [
  ['papa', 'haba', 'papa'], ['papa', 'papa', 'haba'], ['papa', 'cebada', 'papa'], ['maiz_amilaceo', 'papa', 'papa'], ['papa', 'haba', 'cebada'],
  ['haba', 'papa', 'papa'], ['papa', 'papa', 'papa'], ['avena_forrajera', 'papa', 'haba'], ['papa', 'oca', 'haba'], ['cebada', 'papa', 'avena_forrajera'],
];
const FOCUS: FocusId[] = ['money', 'safeHarvest', 'goodLand', 'animals'];
const MARKETS = ['autoconsumo', 'mixto', 'mixto', 'feria_local', 'feria_local', 'intermediario'] as const;
const uid = (c: number, n: number) => `00000000-0000-4000-8${String(c).padStart(3, '0')}-${String(n).padStart(12, '0')}`;

type FamRow = { community: number; market: string; focus: string; areaHa: number; incCurrent: number; incSolo: number; incCommunity: number; lossCurrent: number; lossCommunity: number; transfer: number };
const rows: FamRow[] = [];
const comm: Record<string, number>[] = [];

for (let c = 0; c < N; c++) {
  const rnd = mulberry32(1000 + c);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  // 10 familias × 2 chacras (orden aleatorio)
  const order = FIELDS.map((_, i) => i).sort(() => rnd() - 0.5);
  const participants: EngineInput['participants'] = [];
  for (let f = 0; f < 10; f++) {
    const focus = [pick(FOCUS)];
    if (rnd() < 0.5) { const s = pick(FOCUS); if (s !== focus[0]) focus.push(s); }
    const market = pick(MARKETS);
    const livestock = focus.includes('animals') ? 8 + Math.floor(rnd() * 15) : Math.floor(rnd() * 6);
    const constraints = { traction: pick(['manual', 'yunta', 'yunta', 'tractor'] as const), familyWorkers: 1 + Math.floor(rnd() * 4), canGetExtraLabor: rnd() < 0.7, market, livestockHeads: livestock };
    participants.push({
      userId: uid(c, f + 1), submittedAt: '2026-11-14T10:00:00.000Z',
      preferences: { coins: coinsFromFocus(focus, { livestockHeads: livestock, market, hasRainfedParcel: false }, A), constraints, vetoes: [] },
      parcels: [order[2 * f]!, order[2 * f + 1]!].map((i) => {
        const fl = FIELDS[i]!;
        const cx = fl.ring.reduce((s, p) => s + p[0], 0) / fl.ring.length, cy = fl.ring.reduce((s, p) => s + p[1], 0) / fl.ring.length;
        return {
          id: uid(c, 100 + i), name: `Chacra ${fl.key}`, polygon: { type: 'Polygon' as const, coordinates: [[...fl.ring, fl.ring[0]!]] }, areaHa: area(fl.ring),
          centroid: [cx, cy] as [number, number], gpsAltitudeM: fl.elevationM,
          // En el Colca el turno de riego se reparte según el área: ~4 h por hectárea, 2–4 turnos al mes
          irrigation: { source: 'canal', turnsPerMonth: 2 + Math.floor(rnd() * 3), hoursPerTurn: Math.max(1.5, Math.round(area(fl.ring) * (3 + rnd() * 2) * 2) / 2) },
          currentRotation: pick(CURRENT), neighborIds: neighbors[i]!.map((j) => uid(c, 100 + j)), observations: [],
        };
      }),
    });
    (participants.at(-1) as unknown as { _focus: string })._focus = focus.join('+');
  }
  const input: EngineInput = { schemaVersion: 1, generatedAt: '2026-11-14T12:00:00.000Z', community: { id: uid(c, 0), name: `Simulación ${c + 1}`, center: [-71.655, -15.644] }, participants };
  const t0 = performance.now();
  const r = runCommunity(makeSnapshot(input, valley, CROPS, A, 7 + c));
  const sec = (performance.now() - t0) / 1000;
  const famIncome = (p: (typeof r.participants)[number], sid: 'current' | 'individual' | 'community') =>
    p.strategies[sid].parcels.reduce((s, x) => s + x.indicators.income.mean * (participants.find((q) => q.userId === p.userId)!.parcels.find((z) => z.id === x.parcelId)!.areaHa), 0);
  for (const p of r.participants) {
    const inp = participants.find((q) => q.userId === p.userId)!;
    const ha = inp.parcels.reduce((s, x) => s + x.areaHa, 0);
    rows.push({
      community: c + 1, market: inp.preferences!.constraints.market, focus: (inp as unknown as { _focus: string })._focus, areaHa: ha,
      incCurrent: famIncome(p, 'current'), incSolo: famIncome(p, 'individual'), incCommunity: famIncome(p, 'community'),
      lossCurrent: p.strategies.current.indicators.climateRisk.mean, lossCommunity: p.strategies.community.indicators.climateRisk.mean, transfer: p.shapley.transfer,
    });
  }
  const m = r.community.metrics;
  comm.push({ pestNow: m.current.meanPestRisk, pestSolo: m.allSolo.meanPestRisk, pestCom: m.community.meanPestRisk, priceSolo: m.allSolo.meanPriceDrop, priceCom: m.community.meanPriceDrop,
    peakNow: m.current.waterPeak_m3, peakSolo: m.allSolo.waterPeak_m3, peakCom: m.community.waterPeak_m3, ruinNow: m.current.ruinProb, ruinCom: m.community.ruinProb, surplus: r.community.surplus_soles, sec });
  console.log(`comunidad ${c + 1}: ${sec.toFixed(1)} s · excedente S/ ${r.community.surplus_soles}`);
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
const pct = (a: number, b: number) => (b - a) / Math.abs(a) * 100;
const fam = (k: keyof FamRow) => rows.map((r) => r[k] as number);
const summary = {
  communities: N, families: rows.length, hectaresPerFamily: mean(fam('areaHa')),
  incomeCurrent_family: mean(fam('incCurrent')), incomeSolo_family: mean(fam('incSolo')), incomeCommunity_family: mean(fam('incCommunity')),
  incomeCurrent_ha: mean(rows.map((r) => r.incCurrent / r.areaHa)), incomeCommunity_ha: mean(rows.map((r) => r.incCommunity / r.areaHa)),
  gainCommunityVsCurrent_family_mean: mean(rows.map((r) => r.incCommunity - r.incCurrent)), gainCommunityVsCurrent_family_median: median(rows.map((r) => r.incCommunity - r.incCurrent)),
  gainPct_mean: pct(mean(fam('incCurrent')), mean(fam('incCommunity'))),
  gainSoloVsCurrent_family: mean(rows.map((r) => r.incSolo - r.incCurrent)), gainCommunityVsSolo_family: mean(rows.map((r) => r.incCommunity - r.incSolo)),
  familiesEarnMore: rows.filter((r) => r.incCommunity > r.incCurrent + 1).length / rows.length,
  lossYearsCurrent: mean(fam('lossCurrent')), lossYearsCommunity: mean(fam('lossCommunity')),
  pestNow: mean(comm.map((c) => c.pestNow!)), pestSolo: mean(comm.map((c) => c.pestSolo!)), pestCom: mean(comm.map((c) => c.pestCom!)),
  priceDropSolo: mean(comm.map((c) => c.priceSolo!)), priceDropCom: mean(comm.map((c) => c.priceCom!)),
  waterPeakSolo: mean(comm.map((c) => c.peakSolo!)), waterPeakCom: mean(comm.map((c) => c.peakCom!)),
  ruinNow: mean(comm.map((c) => c.ruinNow!)), ruinCom: mean(comm.map((c) => c.ruinCom!)),
  surplusCommunity_mean: mean(comm.map((c) => c.surplus!)), secondsPerRun: mean(comm.map((c) => c.sec!)),
  byMarket: Object.fromEntries([...new Set(rows.map((r) => r.market))].map((mk) => { const rs = rows.filter((r) => r.market === mk); return [mk, { n: rs.length, now: mean(rs.map((r) => r.incCurrent)), com: mean(rs.map((r) => r.incCommunity)) }]; })),
  byFocus: Object.fromEntries([...new Set(rows.map((r) => r.focus.split('+')[0]!))].map((fc) => { const rs = rows.filter((r) => r.focus.startsWith(fc)); return [fc, { n: rs.length, now: mean(rs.map((r) => r.incCurrent)), com: mean(rs.map((r) => r.incCommunity)), lossNow: mean(rs.map((r) => r.lossCurrent)), lossCom: mean(rs.map((r) => r.lossCommunity)) }]; })),
};
writeFileSync(new URL(`../../../docs/${OUT}`, import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), referenceHa: REF_HA, note: 'Simulación con clima 1981–2025 (NASA POWER + GPM IMERG), 20 chacras reales de Yanque, familias sintéticas. No es predicción comprobada.', summary, rows, communities: comm }, null, 1));
console.log(JSON.stringify(summary, null, 1));
