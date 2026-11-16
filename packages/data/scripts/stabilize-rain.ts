/**
 * Re-aplica la corrección de lluvia con factores estabilizados (meses secos sin escalar, factor 0,5–3),
 * usando los factores IMERG ya guardados y la lluvia original de POWER (rainRaw). No usa la red.
 *   pnpm -F @qullqa/data exec tsx scripts/stabilize-rain.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ValleyDataset } from '@qullqa/shared';
import { DRY_MONTH_MM, FACTOR_MAX, FACTOR_MIN, stabilizeFactors } from '../src/imerg.ts';

const file = fileURLToPath(new URL('../fixtures/colca.json', import.meta.url));
const ds = JSON.parse(readFileSync(file, 'utf8')) as ValleyDataset;
const d = ds.climate.daily, rc = ds.climate.rainCorrection;
if (!rc || !d.rainRaw) throw new Error('La fixture no tiene corrección IMERG ni rainRaw');
// Media mensual de POWER en el mismo periodo de los factores
const [y0, y1] = rc.years;
const sum = Array(12).fill(0), months = new Set<string>();
d.dates.forEach((t, i) => { const y = Number(t.slice(0, 4)); if (y < y0 || y > y1) return; const m = Number(t.slice(5, 7)) - 1; sum[m] += d.rainRaw![i]!; months.add(t.slice(0, 7)); });
const nYears = y1 - y0 + 1;
const mean = sum.map((v) => v / nYears);
const old = rc.factorByMonth;
const next = stabilizeFactors(old, mean);
d.rain = d.rainRaw.map((r, i) => Math.round(r * next[Number(d.dates[i]!.slice(5, 7)) - 1]! * 100) / 100);
ds.climate.rainCorrection = { ...rc, factorByMonth: next, method: `Escalado mensual: lluvia diaria POWER × (Σ IMERG del mes / Σ POWER del mes) en ${y0}–${y1}, limitado a ${FACTOR_MIN}–${FACTOR_MAX} y sin escalar los meses secos (POWER < ${DRY_MONTH_MM} mm/mes): ahí el cociente es inestable y multiplicaría eventos raros. Corrige el sesgo; no agrega días de lluvia.` };
const { version: _v, createdAt: _c, ...body } = ds;
ds.version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
writeFileSync(file, JSON.stringify(ds));
console.log('POWER media mensual (mm):', mean.map((v) => v.toFixed(1)).join(' '));
console.log('factores antes:  ', old.join(' '));
console.log('factores ahora:  ', next.join(' '));
const yearly = d.rain.reduce((a, b) => a + b, 0) / (d.dates.length / 365.25);
console.log(`✓ ${yearly.toFixed(0)} mm/año · versión ${ds.version}`);
