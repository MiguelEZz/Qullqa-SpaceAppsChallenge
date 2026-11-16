/**
 * Crea (o regenera) la comunidad DEMO simulada y encola su cálculo.
 *   pnpm -F @qullqa/api seed:demo
 * También se puede desde el panel /admin («Regenerar comunidad demo»).
 */
import { migrate, sql } from '../src/db.ts';
import { seedDemoCommunity } from '../src/demo/seed.ts';
import { enqueueRun } from '../src/routes/runs.ts';

await migrate();
const id = await seedDemoCommunity();
const run = await enqueueRun(id, null);
console.log(`✓ Comunidad demo ${id}; cálculo en cola ${run?.id ?? '(no se pudo encolar)'} — el worker debe estar corriendo.`);
await sql.end();
