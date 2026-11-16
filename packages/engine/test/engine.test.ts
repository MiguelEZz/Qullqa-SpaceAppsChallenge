import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASSUMPTIONS, CROPS, CROP_BY_ID, FALLOW } from '@qullqa/catalog';
import type { ValleyDataset } from '@qullqa/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type RunResult, buildParcel, et0Hargreaves, et0PenmanMonteith, extraterrestrialRad, makeSnapshot, mannKendall, massBalanceError,
  privateView, runCommunity, saxtonRawls, season,
} from '../src/index.ts';
import { DEMO_INPUT } from './demoInput.ts';

// Fixture REAL del Colca (NASA POWER, SRTM, SoilGrids, MODIS): los tests nunca llaman a la red.
const valley = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/fixtures/colca.json', import.meta.url)), 'utf8')) as ValleyDataset;

describe('FAO-56 y suelo', () => {
  it('Ra coincide con el ejemplo 8 de FAO-56 (20° S, 3 de setiembre → 32,2 MJ/m²/día)', () => {
    expect(extraterrestrialRad(-20, 246)).toBeCloseTo(32.2, 1);
  });
  it('ET0 Penman-Monteith y Hargreaves dan valores físicos en la sierra', () => {
    const pm = et0PenmanMonteith(18, 2, 50, 2.5, 22, -15.6, 300, 3600);
    const hg = et0Hargreaves(18, 2, -15.6, 300);
    for (const v of [pm, hg]) { expect(v).toBeGreaterThan(2); expect(v).toBeLessThan(8); }
  });
  it('Saxton & Rawls: franco (40 % arena, 20 % arcilla, 2,5 % MO) ≈ CC 0,26 y PMP 0,12', () => {
    const h = saxtonRawls(40, 20, 2.5);
    expect(h.thetaFC).toBeCloseTo(0.26, 1);
    expect(h.thetaWP).toBeCloseTo(0.12, 1);
  });
  it('Mann-Kendall detecta una serie creciente y la pendiente de Sen es exacta', () => {
    const r = mannKendall(Array.from({ length: 30 }, (_, i) => 2 * i + (i % 3)));
    expect(r.trend).toBe(1);
    expect(r.senSlope).toBeCloseTo(2, 0);
  });
});

describe('Balance hídrico diario', () => {
  const p = DEMO_INPUT.participants[0]!.parcels[0]!;
  const dry = { ...p, irrigation: { source: 'none', turnsPerMonth: 0, hoursPerTurn: 0 } };
  const models = [buildParcel(valley, p, 'u', CROP_BY_ID, ASSUMPTIONS), buildParcel(valley, dry, 'u', CROP_BY_ID, ASSUMPTIONS)];

  it('cierra: entrada − salida − Δalmacenamiento = 0 ± 1e-6 en todas las campañas y cultivos', () => {
    let checked = 0;
    for (const m of models) for (const crop of [...CROPS.map((c) => c.id), FALLOW.id]) for (const y of m.campaigns) {
      for (const prev of [null, 'papa', FALLOW.id]) {
        const s = season(m, crop, y, prev);
        expect(Math.abs(massBalanceError(s))).toBeLessThan(1e-6);
        expect(s.yrel).toBeGreaterThanOrEqual(0);
        expect(s.yrel).toBeLessThanOrEqual(1);
        expect(s.erosion_tha).toBeGreaterThanOrEqual(0);
        expect(s.storageEnd).toBeGreaterThanOrEqual(-1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('el riego reduce el déficit de la papa', () => {
    const y = models[0]!.campaigns[10]!;
    expect(season(models[0]!, 'papa', y, null).deficit).toBeLessThan(season(models[1]!, 'papa', y, null).deficit);
  });

  it('cobertura de datos honesta: POWER desde 1981, MODIS desde 2000', () => {
    expect(valley.sources.power!.coverage!.start.startsWith('1981')).toBe(true);
    if (valley.sources.modis_ndvi) expect(valley.sources.modis_ndvi.coverage!.start >= '2000').toBe(true);
    for (const s of Object.values(valley.sources)) expect(['observed', 'estimated', 'simulated', 'assumed']).toContain(s.provenance);
    // Nunca presentar un producto no NASA como NASA
    if (valley.sources.worldcover) expect(valley.sources.worldcover.isNasa).toBe(false);
    if (valley.sources.soilgrids) expect(valley.sources.soilgrids.isNasa).toBe(false);
  });
});

describe('Corrida comunitaria', () => {
  let r: RunResult;
  beforeAll(() => { r = runCommunity(makeSnapshot(DEMO_INPUT, valley, CROPS, ASSUMPTIONS, 7)); });

  it('sin NaN ni Infinity en ninguna salida', () => {
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(r, 'r');
    expect(bad).toEqual([]);
  });

  it('todo indicador y aptitud tiene procedencia; N y plagas son supuestos', () => {
    for (const p of r.participants) {
      for (const card of Object.values(p.strategies)) {
        for (const ind of Object.values(card.indicators)) expect(['observed', 'estimated', 'simulated', 'assumed']).toContain(ind.provenance);
        expect(card.indicators.nitrogen.provenance).toBe('assumed');
        expect(card.indicators.nitrogen.range).toBeDefined();
        expect(card.indicators.pestHealth.provenance).toBe('assumed');
        expect(card.disclaimer).toContain('no reemplaza');
        expect(card.confidence.missing.length + card.confidence.met.length).toBeGreaterThan(0);
        for (const pv of card.parcels) for (const ind of Object.values(pv.indicators)) { expect(ind.score).toBeGreaterThanOrEqual(0); expect(ind.score).toBeLessThanOrEqual(1); }
      }
      for (const list of Object.values(p.aptitude)) for (const a of list) { expect(a.provenance).toBe('simulated'); expect(a.reasons.length).toBeGreaterThan(0); }
    }
  });

  it('racionalidad individual: nadie queda peor que solo cuando el plan es factible', () => {
    if (r.community.feasible) for (const p of r.participants) expect(p.utilityCommunity).toBeGreaterThanOrEqual(p.utilitySolo - 1e-9);
  });

  it('Shapley reparte exactamente el excedente y la compensación suma cero', () => {
    const phi = r.participants.reduce((s, p) => s + p.shapley.phi, 0);
    const tr = r.participants.reduce((s, p) => s + p.shapley.transfer, 0);
    expect(Math.abs(phi - r.community.surplus_soles)).toBeLessThanOrEqual(r.participants.length); // redondeo a soles
    expect(Math.abs(tr)).toBeLessThanOrEqual(r.participants.length);
  });

  it('la vista privada de un agricultor no contiene datos de los demás', () => {
    const me = DEMO_INPUT.participants[0]!;
    const v = privateView(r, me.userId);
    expect(v.me?.userId).toBe(me.userId);
    const text = JSON.stringify(v);
    for (const other of DEMO_INPUT.participants.slice(1)) {
      expect(text).not.toContain(other.userId);
      for (const p of other.parcels) expect(text).not.toContain(p.name);
    }
    expect(text).not.toContain('coins');
    expect(v.community.plan.filter((p) => p.mine)).toHaveLength(me.parcels.length);
    expect(v.community.transfers.receive + v.community.transfers.give + v.community.transfers.none).toBe(r.participants.length);
    expect(privateView(r, 'nadie').me).toBeNull();
  });

  it('planes fijos: el recién llegado obtiene su plan y los vecinos conservan el suyo', () => {
    const fixedPlans = Object.fromEntries(r.community.plan.filter((p) => p.ownerId !== DEMO_INPUT.participants[2]!.userId).map((p) => [p.parcelId, p.rotation]));
    const inc = runCommunity(makeSnapshot(DEMO_INPUT, valley, CROPS, ASSUMPTIONS, 7, undefined, fixedPlans));
    for (const p of inc.community.plan) if (fixedPlans[p.parcelId]) expect(p.rotation).toEqual(fixedPlans[p.parcelId]);
    const mine = inc.participants.find((p) => p.userId === DEMO_INPUT.participants[2]!.userId)!;
    expect(mine.strategies.community.parcels.length).toBe(DEMO_INPUT.participants[2]!.parcels.length);
  });

  it('determinismo: misma entrada + misma semilla ⇒ salida idéntica', () => {
    const again = runCommunity(makeSnapshot(DEMO_INPUT, valley, CROPS, ASSUMPTIONS, 7));
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
  });

  it('el snapshot es inmutable frente a cambios posteriores de la entrada', () => {
    const input = structuredClone(DEMO_INPUT);
    const snap = makeSnapshot(input, valley, CROPS, ASSUMPTIONS, 7);
    input.participants[0]!.parcels[0]!.areaHa = 99;
    expect(snap.input.participants[0]!.parcels[0]!.areaHa).toBe(0.5);
  });

  it('«qué pasa si» con 30 % menos lluvia no mejora el agua de la rotación actual', () => {
    const dry = runCommunity(makeSnapshot(DEMO_INPUT, valley, CROPS, ASSUMPTIONS, 7, { rainFactor: 0.7 }));
    const base = r.participants[1]!.strategies.current.indicators.water.mean;
    expect(dry.participants[1]!.strategies.current.indicators.water.mean).toBeGreaterThanOrEqual(base - 1e-9);
  });

  it('comunidad densa con mercado chico: coordinar nunca deja a la comunidad peor que todos por separado', () => {
    const dense = structuredClone(DEMO_INPUT);
    const all = dense.participants.flatMap((p) => p.parcels);
    for (const p of all) p.neighborIds = all.filter((q) => q.id !== p.id).map((q) => q.id);
    const a = { ...ASSUMPTIONS, market: { ...ASSUMPTIONS.market, referenceHa: 0.5 } };
    const res = runCommunity(makeSnapshot(dense, valley, CROPS, a, 3));
    const m = res.community.metrics;
    expect(res.community.feasible).toBe(true);
    for (const p of res.participants) expect(p.utilityCommunity).toBeGreaterThanOrEqual(p.utilitySolo - 1e-9);
    expect(res.community.surplus_soles).toBeGreaterThanOrEqual(-1);
    expect(m.community.meanPestRisk).toBeLessThanOrEqual(m.allSolo.meanPestRisk + 0.05);
  });
});
