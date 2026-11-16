/**
 * Aplica la corrección de lluvia con GPM IMERG a la fixture existente, sin volver a bajar todo.
 *   pnpm -F @qullqa/data correct:rain
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ValleyDataset } from '@qullqa/shared';
import { correctRain } from '../src/valley.ts';

const file = fileURLToPath(new URL('../fixtures/colca.json', import.meta.url));
const ds = JSON.parse(readFileSync(file, 'utf8')) as ValleyDataset;
const token = process.env.EARTHDATA_TOKEN;
if (!token) throw new Error('Falta EARTHDATA_TOKEN en .env');
ds.climate.rainCorrection = await correctRain(ds.climate.daily, token, ds.center, ds.sources, console.log);
ds.warnings = ds.warnings.filter((w) => !w.includes('IMERG') && !w.includes('sin corregir'));
const { version: _v, createdAt: _c, ...body } = ds;
ds.version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
writeFileSync(file, JSON.stringify(ds));
const yearly = ds.climate.daily.rain.reduce((a, b) => a + b, 0) / (ds.climate.daily.dates.length / 365.25);
console.log(`✓ lluvia corregida: ${yearly.toFixed(0)} mm/año (versión ${ds.version})`);
