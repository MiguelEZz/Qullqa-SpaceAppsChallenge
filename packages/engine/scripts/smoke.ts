import { readFileSync } from 'node:fs';
import { CROPS, ASSUMPTIONS } from '@qullqa/catalog';
import { runCommunity, makeSnapshot } from '../src/index.ts';
import { DEMO_INPUT } from '../test/demoInput.ts';
const valley = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const t = Date.now();
const r = runCommunity(makeSnapshot(DEMO_INPUT, valley, CROPS, ASSUMPTIONS, 42));
console.log('tiempo', ((Date.now() - t) / 1000).toFixed(1), 's');
for (const p of r.participants) {
  console.log('\n== jugador', p.userId.slice(-3), 'Usolo', p.utilitySolo, 'Ucom', p.utilityCommunity, 'ok', p.rationalityOk, 'shapley', JSON.stringify(p.shapley));
  for (const [pid, apts] of Object.entries(p.aptitude)) console.log('  apt', pid.slice(-3), apts.map((a) => `${a.crop}:${a.aptitude}`).join(' '));
  for (const s of ['current', 'individual', 'community'] as const) {
    const c = p.strategies[s];
    console.log(`  [${s}] U=${c.utility} conf=${c.confidence.level}`, c.parcels.map((x) => x.rotation.map((r) => `${r.cropName}(${r.sowing}→${r.harvest})`).join(' > ')).join(' | '));
    console.log('     ', Object.values(c.indicators).map((i) => `${i.id}=${Math.round(i.mean * 100) / 100}/${Math.round(i.score * 100) / 100}`).join(' '));
  }
  console.log('  riesgos:', p.strategies.community.risks.slice(0, 3));
  console.log('  elNino:', JSON.stringify(p.elNino.slice(0, 2)));
  console.log('  notas:', p.fieldNotes);
}
console.log('\nbeneficio mutuo:', r.community.mutualBenefit);
console.log('anneal', r.community.anneal, 'feasible', r.community.feasible);
console.log('tendencias:', r.diagnosis?.trends.map((t) => t.text));
console.log('tipos:', r.diagnosis?.yearTypes.types.map((t) => `${t.name}:${t.count}(niño ${t.elNino})`));
console.log('perfil 2015:', JSON.stringify(r.diagnosis?.profiles.find((p) => p.year === 2015)));
console.log('warnings:', r.warnings);
