import type { Assumptions, CropCard } from '@qullqa/catalog';
import { FALLOW } from '@qullqa/catalog';
import type { ParcelClimate } from './climate.ts';
import { type SoilHydraulics, erosivityR } from './soil.ts';

/**
 * Balance hídrico DIARIO FAO-56 (spec §15.3, §15.4) para una campaña (1 jul → 30 jun).
 * Dos compartimentos: zona radicular (crece con la raíz) y subsuelo hasta `profileDepth_m`.
 * Conserva masa: lluvia + riego = escorrentía + pérdidas de riego + ETa + percolación profunda + ΔS.
 */

/** Estado del suelo al 1 de julio (siempre con raíz «desnuda»), independiente del cultivo. */
export interface SoilState { rootAW: number; subAW: number }

export interface IrrigationSupply { grossPerTurn_mm: number; intervalDays: number }

export interface SiteParams {
  hydraulics: SoilHydraulics;
  profileDepth_m: number;
  irrigation: IrrigationSupply | null;
  /** K × LS × P de RUSLE (todo menos R y C). */
  erosionKLSP: number;
}

export interface StageAcc { name: string; etc: number; eta: number; ky: number; frost: number; heat: number }

export interface SeasonResult {
  campaign: number;
  crop: string;
  sowIdx: number;
  harvestIdx: number;
  /** No hubo día viable de siembra en la ventana: se sembró al final (tarde). */
  lateSowing: boolean;
  /** El ciclo no cabía en la campaña: se cortó al 30 jun. */
  truncated: boolean;
  stages: StageAcc[];
  /** Π_j (1 − Ky_j (1 − ETa_j/ETc_j)), solo por agua. */
  yrelWater: number;
  frostEvents: number;
  heatEvents: number;
  /** Rendimiento relativo final (agua × helada × calor), 0–1. Simulado. */
  yrel: number;
  etc: number;
  eta: number;
  deficit: number;
  irrigation: number;
  rain: number;
  runoff: number;
  irrigationLoss: number;
  deepPercolation: number;
  et: number;
  storageStart: number;
  storageEnd: number;
  gdd: number;
  /** Por década del año (índice 0 = década 1). ETa/ETc del cultivo (NaN fuera del ciclo). */
  ratioByDecade: Float32Array;
  /** Riego bruto por década del año (mm). */
  irrigationByDecade: Float32Array;
  /** Días con helada letal por década del año. */
  frostByDecade: Uint8Array;
  erosion_tha: number;
  end: SoilState;
}

const BARE_ZR = 0.15;
const DESCANSO_ZR = 0.3;

/** Elige el día de siembra de una campaña (spec §7.1). Independiente del cultivo anterior. */
export function sowingDay(c: ParcelClimate, crop: CropCard, campaign: number, irrigated: boolean, a: Assumptions): { idx: number; late: boolean } {
  const i0 = c.campaignStart.get(campaign)!;
  const [w0, w1] = crop.sowingWindow;
  const inWin = (d: number) => (w0 <= w1 ? d >= w0 && d <= w1 : d >= w0 || d <= w1);
  let last = -1;
  for (let i = i0; i < i0 + 366 && i < c.days.length; i++) {
    const d = c.days[i]!;
    if (c.campaign[i] !== campaign) break;
    if (!inWin(d.decade)) { if (last >= 0) break; continue; }
    last = i;
    if (c.tmin[i]! < a.sowing.minTmin_C) continue;
    if (irrigated) return { idx: i, late: false };
    let r10 = 0;
    for (let j = Math.max(0, i - 9); j <= i; j++) r10 += c.rain[j]!;
    if (r10 >= a.sowing.onsetRain10d_mm) return { idx: i, late: false };
  }
  return { idx: last, late: true };
}

export function referenceState(site: SiteParams, relative = 0.3): SoilState {
  const t = site.hydraulics.tawPerM;
  return { rootAW: t * BARE_ZR * relative, subAW: t * (site.profileDepth_m - BARE_ZR) * relative };
}

/**
 * Simula una campaña. `crop` null = descanso. `sow` viene de `sowingDay` (precalculado).
 */
export function simulateSeason(
  c: ParcelClimate, campaign: number, crop: CropCard | null, sow: { idx: number; late: boolean } | null,
  site: SiteParams, init: SoilState, a: Assumptions,
): SeasonResult {
  const i0 = c.campaignStart.get(campaign)!;
  const i1 = (c.campaignStart.get(campaign + 1) ?? c.days.length) - 1;
  const taw = site.hydraulics.tawPerM;
  const Zp = site.profileDepth_m;
  const irr = site.irrigation;

  // Calendario del cultivo en días
  const stageDays = crop ? crop.stages.map((s) => s.duration_decades * 10) : [];
  const cycle = stageDays.reduce((x, y) => x + y, 0);
  const sowIdx = crop && sow ? sow.idx : -1;
  let harvestIdx = crop ? sowIdx + cycle - 1 : -1;
  const truncated = crop ? harvestIdx > i1 : false;
  if (truncated) harvestIdx = i1;
  const devEnd = crop ? stageDays[0]! + stageDays[1]! : 0;
  const kcIni = crop?.stages[0]!.kc ?? 0, kcMid = crop?.stages[2]!.kc ?? 0, kcEnd = crop?.stages[3]!.kc ?? 0;

  const stages: StageAcc[] = crop ? crop.stages.map((s) => ({ name: s.name, etc: 0, eta: 0, ky: s.ky, frost: 0, heat: 0 })) : [];
  const ratioEta = new Float64Array(36), ratioEtc = new Float64Array(36);
  const irrigationByDecade = new Float32Array(36);
  const frostByDecade = new Uint8Array(36);

  let rootAW = init.rootAW, subAW = init.subAW, Zr = BARE_ZR;
  const storageStart = rootAW + subAW;
  let rain = 0, runoff = 0, irrigation = 0, irrigationLoss = 0, deep = 0, et = 0, etcS = 0, etaS = 0, gdd = 0;
  let frostEvents = 0, heatEvents = 0;
  let cRain = 0; // Σ C_día × lluvia_día (para RUSLE)
  const bareC = a.erosion.bareC;

  for (let i = i0; i <= i1; i++) {
    const growing = crop !== null && i >= sowIdx && i <= harvestIdx;
    const k = growing ? i - sowIdx : -1;
    let zTarget: number, kc: number, p: number, C: number, stage = -1;
    if (growing) {
      stage = 0;
      let acc = stageDays[0]!;
      while (k >= acc && stage < 3) { stage++; acc += stageDays[stage]!; }
      const st0 = stageDays[0]!, st1 = stageDays[1]!, st3 = stageDays[3]!;
      if (stage === 0) kc = kcIni;
      else if (stage === 1) kc = kcIni + ((kcMid - kcIni) * (k - st0)) / st1;
      else if (stage === 2) kc = kcMid;
      else kc = kcMid + ((kcEnd - kcMid) * (k - (cycle - st3))) / st3;
      zTarget = k >= devEnd ? crop.rootDepth_max_m : crop.rootDepth_initial_m + ((crop.rootDepth_max_m - crop.rootDepth_initial_m) * k) / devEnd;
      p = crop.p;
      const f = Math.min(1, k / devEnd);
      C = bareC - (bareC - crop.coverFactor_C) * f;
    } else if (crop === null) {
      zTarget = DESCANSO_ZR; kc = FALLOW.kc; p = 0.5; C = FALLOW.coverFactor_C;
    } else {
      zTarget = BARE_ZR; kc = a.soil.bareSoilKc; p = 0.3; C = bareC;
    }
    zTarget = Math.min(zTarget, Zp - 0.01);

    // Redistribución al cambiar la profundidad de raíz (conserva masa)
    if (zTarget > Zr) {
      const moved = subAW * ((zTarget - Zr) / (Zp - Zr));
      subAW -= moved; rootAW += moved;
    } else if (zTarget < Zr) {
      const moved = rootAW * ((Zr - zTarget) / Zr);
      rootAW -= moved; subAW += moved;
    }
    Zr = zTarget;
    const TAWr = taw * Zr, TAWs = taw * (Zp - Zr);

    // Entradas
    const r = c.rain[i]!;
    const ro = a.soil.runoffFraction * Math.max(0, r - a.soil.runoffThreshold_mm);
    rain += r; runoff += ro;
    rootAW += r - ro;
    cRain += C * r;

    const et0 = c.et0[i]!;
    const ETc = kc * et0;
    const pAdj = Math.min(0.8, Math.max(0.1, p + 0.04 * (5 - ETc)));
    const RAW = pAdj * TAWr;

    // Riego por turnos: el día de siembra (machaco) y en cada turno si Dr > RAW
    if (irr && growing && (k === 0 || (i - i0) % irr.intervalDays === 0)) {
      const Dr = TAWr - Math.min(rootAW, TAWr);
      if (k === 0 || Dr > RAW) {
        const gross = Math.min(irr.grossPerTurn_mm, Dr / a.irrigation.efficiency);
        if (gross > 0) {
          const net = gross * a.irrigation.efficiency;
          irrigation += gross; irrigationLoss += gross - net; rootAW += net;
          irrigationByDecade[c.days[i]!.decade - 1]! += gross;
        }
      }
    }

    // ET con Ks (FAO-56 ec. 84)
    const Dr = TAWr - Math.min(rootAW, TAWr);
    const Ks = Dr <= RAW ? 1 : Math.max(0, (TAWr - Dr) / Math.max(1e-9, TAWr - RAW));
    const ETa = Math.min(Math.max(0, rootAW), Ks * ETc);
    rootAW -= ETa; et += ETa;

    // Drenaje: exceso de la zona radicular al subsuelo; exceso del subsuelo sale
    if (rootAW > TAWr) { subAW += rootAW - TAWr; rootAW = TAWr; }
    if (subAW > TAWs) { deep += subAW - TAWs; subAW = TAWs; }

    if (growing) {
      const s = stages[stage]!;
      const cs = crop.stages[stage]!;
      s.etc += ETc; s.eta += ETa;
      etcS += ETc; etaS += ETa;
      const dec = c.days[i]!.decade - 1;
      ratioEtc[dec]! += ETc; ratioEta[dec]! += ETa;
      gdd += Math.max(0, c.tmean[i]! - crop.gdd_base);
      if (c.tmin[i]! < cs.frostKill_C) { s.frost++; frostEvents++; frostByDecade[dec]!++; }
      if (c.tmax[i]! > cs.heatKill_C) { s.heat++; heatEvents++; }
    }
  }

  // Al 30 jun la raíz vuelve a «desnuda» para que el estado final sea comparable entre cultivos
  if (Zr > BARE_ZR) { const moved = rootAW * ((Zr - BARE_ZR) / Zr); rootAW -= moved; subAW += moved; }
  else if (Zr < BARE_ZR) { const moved = subAW * ((BARE_ZR - Zr) / (Zp - Zr)); subAW -= moved; rootAW += moved; }

  let yrelWater = 1;
  for (const s of stages) if (s.etc > 0) yrelWater *= Math.max(0, 1 - s.ky * (1 - s.eta / s.etc));
  const damage = Math.min(a.damage.maxDamage, frostEvents * a.damage.frostPerEvent + heatEvents * a.damage.heatPerEvent);
  const yrel = crop ? Math.max(0, Math.min(1, yrelWater * (1 - damage))) : 0;

  const ratioByDecade = new Float32Array(36);
  for (let d = 0; d < 36; d++) ratioByDecade[d] = ratioEtc[d]! > 0 ? ratioEta[d]! / ratioEtc[d]! : NaN;

  // RUSLE A = R·K·LS·C·P, con C ponderado por la lluvia de cada día
  const erosion_tha = rain > 1 ? erosivityR(rain) * (cRain / rain) * site.erosionKLSP : 0;

  return {
    campaign, crop: crop?.id ?? FALLOW.id, sowIdx, harvestIdx, lateSowing: !!(crop && sow?.late), truncated,
    stages, yrelWater, frostEvents, heatEvents, yrel,
    etc: etcS, eta: etaS, deficit: Math.max(0, etcS - etaS), irrigation, rain, runoff, irrigationLoss, deepPercolation: deep, et,
    storageStart, storageEnd: rootAW + subAW, gdd,
    ratioByDecade, irrigationByDecade, frostByDecade, erosion_tha, end: { rootAW, subAW },
  };
}

/** Error de cierre del balance (mm). Debe ser ~0. */
export const massBalanceError = (s: SeasonResult) =>
  s.rain + s.irrigation - s.runoff - s.irrigationLoss - s.et - s.deepPercolation - (s.storageEnd - s.storageStart);
