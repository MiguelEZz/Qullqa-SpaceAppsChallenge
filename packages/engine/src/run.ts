import type { Assumptions, CropCard } from '@qullqa/catalog';
import { FALLOW } from '@qullqa/catalog';
import { DISCLAIMER, type EngineInput, type IndicatorId, INDICATORS, type ValleyDataset } from '@qullqa/shared';
import type { WhatIf } from './climate.ts';
import { type CommunityMetrics, type Plan, type PlanEval, type Player, anneal, buildCommunity, cooperationCurve, evaluatePlan, soloPlans } from './community.ts';
import { clusterYears, decadalClimatology, phenology, seasonProfiles, stressHeatmap, trends } from './diagnosis.ts';
import { ELNINO_CASES, ENSO_SOURCE } from './enso.ts';
import { type Confidence, type StrategyCard, type StrategyId, STRATEGY_TITLE, aggregateIndicators, calendar, compareText, confidence, risksFor, rotationText, topCoins } from './explain.ts';
import { ayni, shapley } from './fairness.ts';
import { type AptitudeResult, type ParcelModel, assessAptitude, buildParcel, season } from './parcel.ts';
import { type Rotation, enumerateRotations } from './rotation.ts';
import { campaignLabel, mean, percentile, round } from './util.ts';

export const ENGINE_VERSION = '0.1.0';

/** Snapshot inmutable de una corrida (spec §15.14): con esto se reproduce el resultado exacto. */
export interface RunSnapshot {
  engineVersion: string;
  input: EngineInput;
  valley: ValleyDataset;
  crops: CropCard[];
  assumptions: Assumptions;
  seed: number;
  whatIf?: WhatIf & { outbreakParcelId?: string };
  /**
   * Planes que NO se tocan (parcela → rotación): cuando alguien se suma a una comunidad que ya tiene plan,
   * los vecinos conservan el suyo y solo se busca el mejor plan para el recién llegado, en ese contexto.
   */
  fixedPlans?: Record<string, Rotation>;
}

export function makeSnapshot(input: EngineInput, valley: ValleyDataset, crops: CropCard[], assumptions: Assumptions, seed: number, whatIf?: RunSnapshot['whatIf'], fixedPlans?: Record<string, Rotation>): RunSnapshot {
  // Copia profunda: lo que cambie después en la BD no altera la corrida guardada
  return structuredClone({ engineVersion: ENGINE_VERSION, input, valley, crops, assumptions, seed, ...(whatIf ? { whatIf } : {}), ...(fixedPlans ? { fixedPlans } : {}) });
}

/**
 * Autoconsumo: los alimentos básicos que la familia come valen lo que se ahorra en comprarlos (precio de tienda),
 * según su destino declarado. Supuesto editable (assumptions.market.homeConsumption).
 */
function homeConsumptionCrops(crops: Record<string, CropCard>, market: string, a: Assumptions): Record<string, CropCard> {
  const f = a.market.homeConsumption.priceFactor[market as keyof typeof a.market.homeConsumption.priceFactor] ?? 1;
  if (f === 1) return crops;
  const out = { ...crops };
  for (const id of a.market.homeConsumption.staples) {
    const c = out[id];
    if (!c) continue;
    out[id] = { ...c, priceRange_soles_kg: [c.priceRange_soles_kg[0] * f, c.priceRange_soles_kg[1] * f], source: `${c.source}; valorado como autoconsumo (×${f}, lo que cuesta comprarlo; supuesto)` };
  }
  return out;
}

/** Fusión simple (spec §5): la cosecha registrada corrige el rendimiento potencial, ponderando por precisión. */
function fuseHarvests(m: ParcelModel, obs: EngineInput['participants'][number]['parcels'][number]['observations'], crops: Record<string, CropCard>): { crops: Record<string, CropCard>; notes: string[] } {
  const out = { ...crops };
  const notes: string[] = [];
  for (const o of obs) {
    if (o.value.type !== 'harvest') continue;
    const c = out[o.value.crop];
    if (!c) continue;
    const yObs = o.value.kg / (o.value.areaM2 / 10_000);
    // Rendimiento relativo típico del modelo para ese cultivo en esta parcela
    const yrels = m.campaigns.map((y) => season(m, c.id, y, FALLOW.id).yrel);
    const yrelMed = Math.max(0.2, percentile(yrels, 0.5));
    const potObs = yObs / yrelMed;
    const [lo, hi] = c.yieldPotential_kgha;
    const mu0 = (lo + hi) / 2, s0 = (hi - lo) / 4, s1 = 0.25 * potObs;
    const w0 = 1 / s0 ** 2, w1 = 1 / s1 ** 2;
    const post = (mu0 * w0 + potObs * w1) / (w0 + w1);
    out[c.id] = { ...c, yieldPotential_kgha: [Math.round(post * 0.85), Math.round(post * 1.15)], source: `${c.source}; rendimiento fusionado con cosecha registrada` };
    notes.push(`${c.name}: tu cosecha de ${Math.round(yObs).toLocaleString('es-PE')} kg/ha ajustó el rendimiento esperado de ${Math.round(mu0).toLocaleString('es-PE')} a ${Math.round(post).toLocaleString('es-PE')} kg/ha (fusión ponderada por precisión).`);
  }
  return { crops: out, notes };
}

export interface ParticipantResult {
  userId: string;
  strategies: Record<StrategyId, StrategyCard>;
  /** U_i,solo y U_i,comunitario: la condición U_com ≥ U_solo (spec §8.3). */
  utilitySolo: number;
  utilityCommunity: number;
  rationalityOk: boolean;
  shapley: { phi: number; gain: number; transfer: number; ayni: { soles: number; jornales: number; direction: 'recibe' | 'aporta' | 'nada' } };
  aptitude: Record<string, AptitudeResult[]>;
  elNino: { campaign: string; parcel: string; current: { crop: string; yrel: number } | null; community: { crop: string; yrel: number } | null }[];
  heatmaps: Record<string, ReturnType<typeof stressHeatmap>>;
  fieldNotes: string[];
}

export interface RunResult {
  engineVersion: string;
  seed: number;
  valleyVersion: string;
  generatedFor: string;
  disclaimer: string;
  goldenRule: string;
  dataCoverage: { id: string; product: string; access: string; isNasa: boolean; coverage: string; provenance: string }[];
  participants: ParticipantResult[];
  community: {
    plan: { parcelId: string; ownerId: string; rotation: Rotation; rotationText: string }[];
    feasible: boolean;
    metrics: Record<'current' | 'allSolo' | 'community', CommunityMetrics>;
    mutualBenefit: string[];
    cooperationCurve: { cooperation: number; pestRisk: number; highRiskParcels: number }[];
    shapleyMethod: 'exact' | 'permutations';
    surplus_soles: number;
    anneal: { iterations: number; accepted: number; W: number };
  };
  diagnosis: {
    elevationM: number;
    profiles: ReturnType<typeof seasonProfiles>;
    trends: ReturnType<typeof trends>;
    yearTypes: ReturnType<typeof clusterYears>;
    climatology: ReturnType<typeof decadalClimatology>;
    phenology: ReturnType<typeof phenology> | null;
    ensoSource: string;
  } | null;
  warnings: string[];
}

export const GOLDEN_RULE = 'Qullqa nunca convierte una estimación en un hecho, ni una correlación en una causalidad, ni una simulación en una predicción comprobada.';

export function runCommunity(snap: RunSnapshot): RunResult {
  const { input, valley, assumptions: a, seed } = snap;
  const baseCrops = Object.fromEntries(snap.crops.map((c) => [c.id, c])) as Record<string, CropCard>;
  const warnings = [...valley.warnings];
  const whatIf = snap.whatIf ?? {};

  // ── Jugadores y parcelas ──
  const players: Player[] = [];
  const inputParcels = new Map<string, EngineInput['participants'][number]['parcels'][number]>();
  const notesByUser = new Map<string, string[]>();
  for (const part of input.participants) {
    if (!part.preferences) { warnings.push(`Un participante no tiene prioridades guardadas: queda fuera de la corrida.`); continue; }
    if (!part.parcels.length) { warnings.push(`Un participante no tiene parcelas: queda fuera de la corrida.`); continue; }
    const models: ParcelModel[] = [];
    const notes: string[] = [];
    const famCrops = homeConsumptionCrops(baseCrops, part.preferences.constraints.market, a);
    for (const p of part.parcels) {
      inputParcels.set(p.id, p);
      let m = buildParcel(valley, p, part.userId, famCrops, a, whatIf);
      const fused = fuseHarvests(m, p.observations, famCrops);
      if (fused.notes.length) { m = buildParcel(valley, p, part.userId, fused.crops, a, whatIf); notes.push(...fused.notes); }
      models.push(m);
    }
    notesByUser.set(part.userId, notes);
    players.push({ userId: part.userId, coins: part.preferences.coins as Record<IndicatorId, number>, constraints: part.preferences.constraints, vetoes: part.preferences.vetoes, parcels: models });
  }

  // ── Capa 1: aptitud y candidatas ──
  const aptByParcel = new Map<string, Map<string, AptitudeResult>>();
  const candidates = new Map<string, Rotation[]>();
  for (const pl of players) for (const m of pl.parcels) {
    const apt = new Map<string, AptitudeResult>();
    for (const c of Object.values(m.crops)) apt.set(c.id, assessAptitude(m, c));
    aptByParcel.set(m.id, apt);
    const allowed = [FALLOW.id, ...[...apt.values()].filter((r) => r.aptitude !== 'notApt' && !(pl.vetoes as string[]).includes(r.crop)).map((r) => r.crop)];
    const fixed = snap.fixedPlans?.[m.id];
    if (fixed) { candidates.set(m.id, [fixed]); continue; } // plan ya acordado de un vecino: no se toca
    let cands = enumerateRotations(allowed, { ...a.rotation, fallowId: FALLOW.id }, m.currentRotation[2]);
    // Familias que comen de su chacra: al menos un tubérculo en las 3 campañas (papa «cabeza de rotación»), si alguno es apto
    const eatsFromFarm = pl.constraints.market === 'autoconsumo' || pl.constraints.market === 'mixto';
    if (eatsFromFarm && allowed.some((x) => a.rotation.tubers.includes(x))) {
      const withTuber = cands.filter((r) => r.filter((x) => a.rotation.tubers.includes(x)).length >= a.rotation.minTuberSeasonsForHome);
      if (withTuber.length) cands = withTuber;
    }
    candidates.set(m.id, cands);
  }

  const c = buildCommunity(players, candidates, a, whatIf.outbreakParcelId);
  if (whatIf.outbreakParcelId) warnings.push('Escenario «brote»: la parcela marcada parte con riesgo máximo de plaga.');

  // ── Capa 2 y 3: estrategias ──
  const sq: Plan = c.statusQuo;
  const evSQ = evaluatePlan(c, sq);
  const { plan: solo, Usolo } = soloPlans(c);
  const evSolo = evaluatePlan(c, solo);
  const ann = anneal(c, solo, Usolo, seed);
  const community = ann.plan;
  const evC = ann.eval;
  if (!ann.feasible) warnings.push('El recocido no encontró un plan que deje a todos al menos igual que solos: se muestra el mejor y la compensación lo cubre.');
  const sh = shapley(c, solo, community, a, seed + 1);
  const ay = ayni(sh.transfer, a);
  const curve = cooperationCurve(c, solo, community, seed + 2);

  // ── Diagnóstico del valle (a la altitud mediana de las parcelas) ──
  let diagnosis: RunResult['diagnosis'] = null;
  const allModels = players.flatMap((p) => p.parcels);
  if (allModels.length) {
    const ref = [...allModels].sort((x, y) => x.elevation.value - y.elevation.value)[Math.floor(allModels.length / 2)]!;
    const profiles = seasonProfiles(ref.climate, a);
    const ndviSite = valley.sites.find((s) => s.id === ref.site.id && s.ndvi) ?? valley.sites.find((s) => s.ndvi);
    diagnosis = {
      elevationM: round(ref.elevation.value, 0), profiles, trends: trends(profiles), yearTypes: clusterYears(profiles, 4, seed + 3),
      climatology: decadalClimatology(ref.climate), phenology: ndviSite?.ndvi ? phenology(ndviSite.ndvi) : null, ensoSource: ENSO_SOURCE,
    };
  }

  // ── Tarjetas por participante ──
  // La rotación registrada termina en la campaña en curso (jul–jun) a la fecha de la entrada: el plan empieza en la siguiente.
  const gen = new Date(input.generatedAt);
  const nextCampaign = (gen.getUTCMonth() >= 6 ? gen.getUTCFullYear() : gen.getUTCFullYear() - 1) + 1;
  const first = (m: ParcelModel) => Math.max(nextCampaign, m.campaigns.at(-1)! + 1);
  const participants: ParticipantResult[] = players.map((pl, i) => {
    const idx = c.parcels.map((_, k) => k).filter((k) => c.owner[k] === i);
    const indiv: Plan = sq.slice();
    for (const k of idx) indiv[k] = solo[k]!;
    const evIndiv = evaluatePlan(c, indiv);
    const plans: Record<StrategyId, { plan: Plan; ev: PlanEval }> = { current: { plan: sq, ev: evSQ }, individual: { plan: indiv, ev: evIndiv }, community: { plan: community, ev: evC } };

    const cards = {} as Record<StrategyId, StrategyCard>;
    for (const sid of ['current', 'individual', 'community'] as StrategyId[]) {
      const { plan, ev } = plans[sid];
      const views = idx.map((k) => {
        const m = c.parcels[k]!;
        const st = c.stats(k, plan[k]!);
        return { k, m, st, view: { parcelId: m.id, parcelName: m.name, rotation: calendar(m, plan[k]!, first(m), m.crops), indicators: ev.parcels[k]!.indicators, utility: round(ev.parcels[k]!.utility, 3), failYears: st.failYears, years: st.years.length } };
      });
      const agg = aggregateIndicators(views.map((v) => ({ ind: v.view.indicators, area: v.m.areaHa })));
      const confs: Confidence[] = views.map((v) => confidence(v.m, inputParcels.get(v.m.id)!, plan[v.k]!, v.m.crops, a, input.generatedAt));
      const order = { baja: 0, media: 1, alta: 2 } as const;
      const conf = confs.reduce((w, x) => (order[x.level] < order[w.level] ? x : w), confs[0]!);
      const missing = [...new Set(['Abono orgánico (guano) aplicado: todavía no se registra, así que el balance de materia orgánica no lo incluye.', ...confs.flatMap((x) => x.missing), ...views.flatMap((v) => plan[v.k]!.filter((id) => id !== FALLOW.id).flatMap((id) => v.m.crops[id]?.missing ?? []))])];
      const curViews = idx.map((k) => ({ k, st: c.stats(k, sq[k]!) }));
      const why: string[] = [], evidence: string[] = [], benefits: string[] = [], risks: string[] = [];
      const yrs = views[0]?.st.years ?? [];
      const span = yrs.length ? `${campaignLabel(yrs[0]!)} a ${campaignLabel(yrs.at(-1)! + 2)}` : '';
      for (const v of views) {
        const cur = curViews.find((x) => x.k === v.k)!.st;
        evidence.push(`${v.m.name}: ${rotationText(plan[v.k]!, v.m.crops)}. Simulada en ${v.st.years.length} inicios de rotación con clima NASA POWER (${span}), corregido a ${Math.round(v.m.elevation.value)} m. Habría tenido alguna pérdida (< 50 % del rendimiento) en ${v.st.failYears} de ${v.st.years.length}; la rotación actual, en ${cur.failYears}.`);
        risks.push(...risksFor(v.m, plan[v.k]!, v.st, aptByParcel.get(v.m.id)!, v.m.crops, ev.parcels[v.k]!.pestRisk));
      }
      if (sid === 'current') why.push('Es lo que siembras hoy (las 3 últimas campañas que registraste), repetido en las próximas 3.');
      if (sid === 'individual') why.push(`Es la rotación con mayor puntaje según tus 10 monedas (más peso en: ${topCoins(pl.coins)}), suponiendo que tus vecinos siguen como están.`);
      if (sid === 'community') {
        why.push(`Busca el mayor bienestar de toda la comunidad, con la condición de que nadie quede peor que si cada familia hiciera su mejor plan por separado (tu puntaje: ${round(evC.U[i]!, 3)} frente a ${round(Usolo[i]!, 3)}).`);
        const changed = idx.filter((k) => community[k]!.join() !== solo[k]!.join());
        if (changed.length) why.push(`Cambia tu plan individual en ${changed.length} parcela(s) para coordinar con tus vecinos: menos plagas compartidas, menos sobreoferta en la feria y menos picos de riego.`);
        else why.push('Tu plan individual ya encaja con el de tus vecinos: se mantiene.');
      }
      if (sid !== 'current') {
        const cmp = compareText(cards.current?.indicators ?? aggregateIndicators(curViews.map((x) => ({ ind: evSQ.parcels[x.k]!.indicators, area: c.parcels[x.k]!.areaHa }))), agg);
        benefits.push(...cmp.better.map((t) => `Mejora — ${t}`));
        risks.push(...cmp.worse.map((t) => `Empeora — ${t}`));
      } else benefits.push('No requiere cambiar nada; sirve para comparar.');
      if (diagnosis?.phenology) evidence.push(`Vigor por satélite (NDVI MODIS, 250 m): ${diagnosis.phenology.seasons.length} campañas desde 2000; el píxel mezcla tu parcela con las vecinas.`);
      cards[sid] = {
        strategy: sid, title: STRATEGY_TITLE[sid], parcels: views.map((v) => v.view), utility: round(ev.U[i]!, 3), indicators: agg,
        why, evidence, benefits, missing, risks: [...new Set(risks)], confidence: conf,
        disclaimer: `${DISCLAIMER} Los resultados son simulaciones con clima pasado: una estimación, no una predicción comprobada.`,
      };
    }

    const aptitude: Record<string, AptitudeResult[]> = {};
    for (const k of idx) aptitude[c.parcels[k]!.id] = [...aptByParcel.get(c.parcels[k]!.id)!.values()];
    const heatmaps: Record<string, ReturnType<typeof stressHeatmap>> = {};
    for (const k of idx) {
      const crop = community[k]!.find((x) => x !== FALLOW.id);
      if (crop) heatmaps[c.parcels[k]!.id] = stressHeatmap(c.parcels[k]!, c.parcels[k]!.crops[crop]!);
    }
    const elNino = ELNINO_CASES.flatMap((y) => idx.map((k) => {
      const m = c.parcels[k]!;
      if (!m.campaigns.includes(y)) return { campaign: campaignLabel(y), parcel: m.name, current: null, community: null };
      const pick = (r: Rotation) => { const crop = r[0]; return crop === FALLOW.id ? null : { crop, yrel: round(season(m, crop, y, m.currentRotation[2]).yrel, 2) }; };
      return { campaign: campaignLabel(y), parcel: m.name, current: pick(sq[k]!), community: pick(community[k]!) };
    }));
    return {
      userId: pl.userId, strategies: cards, utilitySolo: round(Usolo[i]!, 4), utilityCommunity: round(evC.U[i]!, 4),
      rationalityOk: evC.U[i]! >= Usolo[i]! - 1e-9,
      shapley: { phi: Math.round(sh.phi[i]!), gain: Math.round(sh.gain[i]!), transfer: Math.round(sh.transfer[i]!), ayni: ay[i]! },
      aptitude, elNino, heatmaps, fieldNotes: notesByUser.get(pl.userId) ?? [],
    };
  });

  // ── Métricas de beneficio mutuo (spec §8.4) ──
  const pct = (from: number, to: number) => (from > 0 ? Math.round(((from - to) / from) * 100) : 0);
  const less = (from: number, to: number) => { const v = pct(from, to); return v >= 0 ? `${v} % menos` : `${-v} % más`; };
  const mutualBenefit: string[] = [];
  const mS = evSolo.metrics, mC = evC.metrics;
  mutualBenefit.push(`Riesgo de plagas: ${less(mS.meanPestRisk, mC.meanPestRisk)} que si cada familia hiciera su mejor plan por separado (índice de continuidad de hospederos; supuesto).`);
  if (mS.waterPeak_m3 > 0) mutualBenefit.push(`Pico de riego comunal: ${less(mS.waterPeak_m3, mC.waterPeak_m3)} (${Math.round(mS.waterPeak_m3)} → ${Math.round(mC.waterPeak_m3)} m³ en la década más demandada).`);
  mutualBenefit.push(`Caída de precio por sobreoferta en la feria: ${Math.round(mS.meanPriceDrop * 100)} % → ${Math.round(mC.meanPriceDrop * 100)} % (elasticidad supuesta ε = ${a.market.elasticity}).`);
  if (mS.downstreamErosion_t > 0) mutualBenefit.push(`Suelo que baja a las parcelas de abajo: ${less(mS.downstreamErosion_t, mC.downstreamErosion_t)}.`);
  mutualBenefit.push(`Probabilidad de ruina (rendimiento < 30 %): ${Math.round(mS.ruinProb * 100)} % → ${Math.round(mC.ruinProb * 100)} %.`);
  mutualBenefit.push(sh.surplus > 0
    ? `Excedente de coordinar: S/ ${Math.round(sh.surplus).toLocaleString('es-PE')} por campaña para toda la comunidad, repartido con Shapley (${sh.method === 'exact' ? 'cálculo exacto' : `${sh.samples} permutaciones`}).`
    : `En soles, coordinar no deja más que sembrar cada uno por su cuenta (${Math.round(sh.surplus).toLocaleString('es-PE')} S/ por campaña): la ventaja está en los otros temas, según las prioridades de cada familia.`);

  return {
    engineVersion: ENGINE_VERSION, seed, valleyVersion: valley.version, generatedFor: input.generatedAt,
    disclaimer: DISCLAIMER, goldenRule: GOLDEN_RULE,
    dataCoverage: Object.values(valley.sources).map((s) => ({ id: s.id, product: s.product, access: s.access, isNasa: s.isNasa, coverage: s.coverage ? `${s.coverage.start.slice(0, 4)}–${s.coverage.end.slice(0, 4)}` : 'estático', provenance: s.provenance })),
    participants,
    community: {
      plan: c.parcels.map((m, k) => ({ parcelId: m.id, ownerId: m.ownerId, rotation: community[k]!, rotationText: rotationText(community[k]!, m.crops) })),
      feasible: ann.feasible,
      metrics: { current: evSQ.metrics, allSolo: mS, community: mC },
      mutualBenefit, cooperationCurve: curve, shapleyMethod: sh.method, surplus_soles: Math.round(sh.surplus),
      anneal: { iterations: ann.iterations, accepted: ann.accepted, W: round(ann.W, 4) },
    },
    diagnosis, warnings,
  };
}

/** Lista de indicadores con etiqueta (para la UI). */
export const INDICATOR_LIST = INDICATORS;

