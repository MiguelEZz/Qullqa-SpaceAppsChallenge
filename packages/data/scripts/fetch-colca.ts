/**
 * Descarga los datos NASA (y complementarios) del corredor Chivay–Yanque–Coporaque y los guarda
 * en fixtures/colca.json. Se corre una vez antes del hackathon: la demo y los tests no dependen de la red.
 *   pnpm -F @qullqa/data fetch:colca
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildValleyDataset } from '../src/valley.ts';

const out = fileURLToPath(new URL('../fixtures/colca.json', import.meta.url));
const t0 = Date.now();

const ds = await buildValleyDataset({
  id: 'colca-chivay-yanque-coporaque',
  name: 'Valle del Colca — corredor Chivay–Yanque–Coporaque',
  center: [-71.635, -15.64],
  // Puntos semilla cerca de cada pueblo; se mueven al andén con más cultivo (WorldCover) en 800 m.
  sites: [
    { id: 'chivay', name: 'Chivay (andenes oeste)', lonLat: [-71.605, -15.645] },
    { id: 'yanque', name: 'Yanque (andenes este)', lonLat: [-71.665, -15.652] },
    { id: 'coporaque', name: 'Coporaque (andenes)', lonLat: [-71.645, -15.628] },
    { id: 'centro', name: 'Centro del corredor', lonLat: [-71.635, -15.64] },
  ],
  snapRadiusM: 800,
  earthdataToken: process.env.EARTHDATA_TOKEN || undefined,
  log: (m) => console.log(m),
});

writeFileSync(out, JSON.stringify(ds));
console.log(`\n✓ ${out} (${(JSON.stringify(ds).length / 1e6).toFixed(1)} MB, versión ${ds.version}) en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (ds.warnings.length) console.log('Avisos:\n- ' + ds.warnings.join('\n- '));
