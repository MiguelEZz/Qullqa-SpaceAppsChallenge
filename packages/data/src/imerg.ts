import type { DailyClimate, SourceInfo } from '@qullqa/shared';
import { pool, sleep } from './http.ts';

/**
 * GPM IMERG Final mensual V07 (0,1° ≈ 10 km) por OPeNDAP de GES DISC, con el token de Earthdata.
 * Solo se usa para CORREGIR EL SESGO mensual de la lluvia de POWER (escalado por mes), no la reemplaza:
 * así la serie diaria sigue cubriendo desde 1981 (spec §15.2: cada variable dice su cobertura real).
 */
export const IMERG_SOURCE: SourceInfo = {
  id: 'imerg_monthly',
  product: 'GPM IMERG Final mensual V07 (0,1°)',
  producer: 'NASA GES DISC',
  access: 'OPeNDAP de GES DISC (token Earthdata)',
  isNasa: true,
  resolution: '0,1° (~10 km), mensual',
  coverage: null,
  provenance: 'estimated',
  notes: 'Producto satelital calibrado con pluviómetros. Usado para corregir el sesgo mensual de POWER.',
};

const BASE = 'https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGM.07';

/** Índices de la grilla IMERG (lon −179,95…179,95; lat −89,95…89,95, paso 0,1°). */
const gridIndex = ([lon, lat]: [number, number]) => [Math.round((lon + 179.95) / 0.1), Math.round((lat + 89.95) / 0.1)] as const;

async function fetchMonth(token: string, y: number, m: number, li: number, la: number): Promise<number | null> {
  const mm = String(m).padStart(2, '0');
  const file = `3B-MO.MS.MRG.3IMERG.${y}${mm}01-S000000-E235959.${mm}.V07B.HDF5`;
  const url = `${BASE}/${y}/${file}.ascii?precipitation%5B0%5D%5B${li}%5D%5B${la}%5D`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow', signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (res?.status === 401 || res?.status === 403) throw new Error('GES DISC rechazó el token: autoriza «NASA GESDISC DATA ARCHIVE» en tu perfil de Earthdata.');
    if (res?.status === 404) return null;
    if (res?.ok) {
      const txt = await res.text();
      // La última línea numérica tiene el valor: "[0][0], 0.0123"
      const v = Number(txt.trim().split(/[\s,]+/).at(-1));
      if (!Number.isFinite(v) || v < 0) return null;
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return v * 24 * days; // mm/h promedio → mm del mes
    }
    await sleep(1500 * 2 ** attempt);
  }
  return null;
}

export interface RainCorrection {
  /** Factor por mes (ene…dic): lluvia IMERG / lluvia POWER en los años comunes. */
  factorByMonth: number[];
  years: [number, number];
  method: string;
}

export const DRY_MONTH_MM = 5;
export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 3;

/**
 * Factores mensuales confiables: en meses secos (lluvia media POWER < 5 mm/mes) el cociente IMERG/POWER sale de
 * números diminutos y puede valer ×3,5; aplicado a un evento raro (p. ej. 109 mm en junio de 2025) lo infla a ~380 mm.
 */
export function stabilizeFactors(ratio: number[], powerMonthlyMean: number[]): number[] {
  return ratio.map((f, i) => (powerMonthlyMean[i]! < DRY_MONTH_MM || !Number.isFinite(f) ? 1 : Math.round(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f)) * 1000) / 1000));
}

export async function imergRainCorrection(token: string, lonLat: [number, number], power: DailyClimate, startYear = 2001, endYear = 2024, log?: (m: string) => void): Promise<RainCorrection> {
  const [li, la] = gridIndex(lonLat);
  const months: [number, number][] = [];
  for (let y = startYear; y <= endYear; y++) for (let m = 1; m <= 12; m++) months.push([y, m]);
  let done = 0;
  const vals = await pool(months, 6, async ([y, m]) => {
    const v = await fetchMonth(token, y, m, li, la);
    if (++done % 48 === 0) log?.(`  IMERG ${done}/${months.length}`);
    return v;
  });
  const powerMonth = new Map<string, number>();
  power.dates.forEach((d, i) => { const k = d.slice(0, 7); powerMonth.set(k, (powerMonth.get(k) ?? 0) + power.rain[i]!); });
  const im = Array(12).fill(0), pw = Array(12).fill(0), n = Array(12).fill(0);
  months.forEach(([y, m], k) => {
    const v = vals[k];
    const p = powerMonth.get(`${y}-${String(m).padStart(2, '0')}`);
    if (v === null || v === undefined || p === undefined) return;
    im[m - 1] += v; pw[m - 1] += p; n[m - 1]++;
  });
  const factorByMonth = stabilizeFactors(im.map((v, i) => (pw[i] > 0 ? v / pw[i] : 1)), pw.map((v, i) => (n[i] ? v / n[i] : 0)));
  return {
    factorByMonth, years: [startYear, endYear],
    method: `Escalado mensual: lluvia diaria POWER × (Σ IMERG del mes / Σ POWER del mes) en ${startYear}–${endYear}, limitado a ${FACTOR_MIN}–${FACTOR_MAX} y sin escalar los meses secos (POWER < ${DRY_MONTH_MM} mm/mes): ahí el cociente es inestable y multiplicaría eventos raros. Corrige el sesgo; no agrega días de lluvia.`,
  };
}
