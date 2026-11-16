/** Resume el plan de una entrada exportada: tsx scripts/plan-summary.ts <engine-input.json> <valley.json> */
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS, CROPS } from '@qullqa/catalog';
import { makeSnapshot, runCommunity } from '../src/index.ts';
const input = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const valley = JSON.parse(readFileSync(process.argv[3]!, 'utf8'));
const t0 = performance.now();
const r = runCommunity(makeSnapshot(input, valley, CROPS, ASSUMPTIONS, 7));
console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
const cnt: Record<string, number> = {};
for (const p of r.community.plan) cnt[p.rotationText] = (cnt[p.rotationText] ?? 0) + 1;
console.table(cnt);
const firstYear: Record<string, number> = {};
for (const p of r.community.plan) firstYear[p.rotation[0]!] = (firstYear[p.rotation[0]!] ?? 0) + 1;
console.log('año 1:', firstYear);
for (const p of r.participants) {
  const mk = input.participants.find((x: { userId: string }) => x.userId === p.userId).preferences.constraints.market;
  console.log(mk.padEnd(14), p.strategies.community.parcels.map((x) => x.rotation.map((z) => z.crop).join('-')).join(' | '));
}
console.log(r.community.mutualBenefit.join('\n'));
