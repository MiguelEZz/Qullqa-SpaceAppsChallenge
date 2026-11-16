import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ValleyDataset } from '@qullqa/shared';

/** Datasets de valle procesados (packages/data/fixtures). La comunidad apunta a uno con communities.valley_id. */
const FILES: Record<string, string> = {
  'colca-chivay-yanque-coporaque': '../../../packages/data/fixtures/colca.json',
};

const cache = new Map<string, ValleyDataset>();

export function loadValley(id: string): ValleyDataset {
  const hit = cache.get(id);
  if (hit) return hit;
  const rel = FILES[id];
  if (!rel) throw new Error(`No hay datos procesados para el valle «${id}»`);
  const v = JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as ValleyDataset;
  if (v.id !== id) throw new Error(`El archivo del valle «${id}» contiene «${v.id}»`);
  cache.set(id, v);
  return v;
}
