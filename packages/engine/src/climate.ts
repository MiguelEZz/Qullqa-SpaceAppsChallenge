import type { ValleyDataset } from '@qullqa/shared';
import type { Assumptions } from '@qullqa/catalog';
import { type DayInfo, campaignOf, dayInfo } from './util.ts';

/** Serie diaria llevada a la parcela (spec §2 y §15.3). Todo es 'estimated' (reanálisis + corrección). */
export interface ParcelClimate {
  days: DayInfo[];
  campaign: number[];
  tmax: Float64Array;
  /** Tmin_parcela = Tmin_celda − lapse × (z_parcela − z_celda) − δ_posición */
  tmin: Float64Array;
  tmean: Float64Array;
  rain: Float64Array;
  et0: Float64Array;
  /** true si ET0 salió de Penman-Monteith (hay radiación); false si de Hargreaves. */
  et0IsPM: Uint8Array;
  gwetroot: (number | null)[];
  elevationM: number;
  /** Índice del primer día de cada campaña (1 jul). */
  campaignStart: Map<number, number>;
  /** Campañas completas (1 jul → 30 jun) disponibles. */
  campaigns: number[];
}

export interface WhatIf {
  /** Multiplicador de lluvia, p. ej. 0.7 = −30 %. */
  rainFactor?: number;
  /** °C que se suman a Tmax/Tmin. */
  tempDelta?: number;
}

// ───────────── ET0 (FAO-56) ─────────────
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));

/** Radiación extraterrestre Ra (MJ/m²/día), FAO-56 ec. 21. */
export function extraterrestrialRad(latDeg: number, doy: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** FAO-56 Penman-Monteith diario (mm/día). rh en %, viento a 2 m (m/s), radiación MJ/m²/día. */
export function et0PenmanMonteith(tmax: number, tmin: number, rh: number, wind: number, radiation: number, lat: number, doy: number, elevationM: number): number {
  const t = (tmax + tmin) / 2;
  const P = 101.3 * ((293 - 0.0065 * elevationM) / 293) ** 5.26;
  const gamma = 0.000665 * P;
  const delta = (4098 * es(t)) / (t + 237.3) ** 2;
  const esat = (es(tmax) + es(tmin)) / 2;
  const ea = Math.min(esat, (rh / 100) * esat);
  const Ra = extraterrestrialRad(lat, doy);
  const Rso = (0.75 + 2e-5 * elevationM) * Ra;
  const Rns = 0.77 * radiation;
  const sigma = 4.903e-9;
  const ratio = Math.min(1, radiation / Math.max(Rso, 1e-6));
  const Rnl = sigma * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * ratio - 0.35);
  const Rn = Rns - Rnl;
  const et0 = (0.408 * delta * Rn + gamma * (900 / (t + 273)) * wind * (esat - ea)) / (delta + gamma * (1 + 0.34 * wind));
  return Math.max(0, et0);
}

/** Hargreaves (mm/día): cuando no hay radiación (POWER antes de 1984). */
export function et0Hargreaves(tmax: number, tmin: number, lat: number, doy: number): number {
  const t = (tmax + tmin) / 2;
  return Math.max(0, 0.0023 * (t + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * 0.408 * extraterrestrialRad(lat, doy));
}

export const etc = (et0: number, kc: number) => et0 * kc;

/** Lleva el clima de la celda POWER a la parcela (altitud, δ_posición y escenario «qué pasa si»). */
/** `deltaPosition_C`: un valor o 12 valores (uno por mes, de ene a dic). */
export function parcelClimate(valley: ValleyDataset, elevationM: number, lat: number, a: Assumptions, whatIf: WhatIf = {}, deltaPosition_C: number | number[] = a.climate.deltaPosition_C): ParcelClimate {
  const d = valley.climate.daily;
  const n = d.dates.length;
  const shift = -a.climate.lapseRate_Cpm * (elevationM - valley.climate.cell.elevationM) + (whatIf.tempDelta ?? 0);
  const rf = whatIf.rainFactor ?? 1;
  const out: ParcelClimate = {
    days: new Array(n), campaign: new Array(n), tmax: new Float64Array(n), tmin: new Float64Array(n), tmean: new Float64Array(n),
    rain: new Float64Array(n), et0: new Float64Array(n), et0IsPM: new Uint8Array(n), gwetroot: d.gwetroot, elevationM,
    campaignStart: new Map(), campaigns: [],
  };
  for (let i = 0; i < n; i++) {
    const di = dayInfo(d.dates[i]!);
    out.days[i] = di;
    out.campaign[i] = campaignOf(di);
    const tmax = d.tmax[i]! + shift;
    const delta = typeof deltaPosition_C === 'number' ? deltaPosition_C : deltaPosition_C[di.month - 1] ?? 0;
    const tmin = Math.min(tmax - 0.5, d.tmin[i]! + shift - delta);
    out.tmax[i] = tmax;
    out.tmin[i] = tmin;
    out.tmean[i] = (tmax + tmin) / 2;
    out.rain[i] = d.rain[i]! * rf;
    const rad = d.rad[i];
    if (rad !== null && rad !== undefined) {
      out.et0[i] = et0PenmanMonteith(tmax, tmin, d.rh[i]!, d.wind[i]!, rad, lat, di.doy, elevationM);
      out.et0IsPM[i] = 1;
    } else out.et0[i] = et0Hargreaves(tmax, tmin, lat, di.doy);
    if (di.month === 7 && di.day === 1) out.campaignStart.set(di.year, i);
  }
  for (const [y, i] of out.campaignStart) {
    const end = out.campaignStart.get(y + 1);
    // completa si existe el 30 jun siguiente
    const last = end !== undefined ? end - 1 : n - 1;
    const ld = out.days[last]!;
    if (ld.month === 6 && ld.day === 30 && ld.year === y + 1 && last - i >= 360) out.campaigns.push(y);
  }
  out.campaigns.sort((x, y) => x - y);
  return out;
}

/** Agregación a décadas (solo para visualizar/resumir, spec §15.3). */
export interface DecadalRecord {
  year: number; decade: number; rain_mm: number; tmax: number; tmin: number; tmin_adjusted: number; et0: number; gwetroot: number | null;
  provenance: Record<string, 'estimated' | 'simulated'>;
}

export function toDecadal(c: ParcelClimate, rawTmin?: number[]): DecadalRecord[] {
  const out: DecadalRecord[] = [];
  let cur: { key: string; rec: DecadalRecord; n: number; gw: number; gwn: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const r = cur.rec;
    r.tmax /= cur.n; r.tmin /= cur.n; r.tmin_adjusted /= cur.n;
    r.gwetroot = cur.gwn ? cur.gw / cur.gwn : null;
    out.push(r);
  };
  for (let i = 0; i < c.days.length; i++) {
    const d = c.days[i]!;
    const key = `${d.year}-${d.decade}`;
    if (!cur || cur.key !== key) {
      flush();
      cur = { key, n: 0, gw: 0, gwn: 0, rec: { year: d.year, decade: d.decade, rain_mm: 0, tmax: 0, tmin: 0, tmin_adjusted: 0, et0: 0, gwetroot: null, provenance: { rain_mm: 'estimated', tmin_adjusted: 'estimated', et0: 'estimated', gwetroot: 'estimated' } } };
    }
    cur.n++;
    cur.rec.rain_mm += c.rain[i]!;
    cur.rec.tmax += c.tmax[i]!;
    cur.rec.tmin += rawTmin?.[i] ?? c.tmin[i]!;
    cur.rec.tmin_adjusted += c.tmin[i]!;
    cur.rec.et0 += c.et0[i]!;
    const g = c.gwetroot[i];
    if (g !== null && g !== undefined) { cur.gw += g; cur.gwn++; }
  }
  flush();
  return out;
}
