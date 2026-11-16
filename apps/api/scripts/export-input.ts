/**
 * Exporta el EngineInput de una comunidad a JSON (lo que recibirá el cerebro).
 *   pnpm -F @qullqa/api export:input            → lista comunidades
 *   pnpm -F @qullqa/api export:input <id> [--all]  → escribe out/engine-input-<id>.json
 * --all incluye a quienes aún no pulsaron «Enviar mis datos».
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { sql } from '../src/db.ts';
import { buildEngineInput } from '../src/engineInput.ts';

const [id, flag] = process.argv.slice(2);
if (!id) {
  const rows = await sql`
    select c.id, c.name, c.slug,
      (select count(*)::int from memberships m where m.community_id = c.id) as miembros,
      (select count(*)::int from memberships m where m.community_id = c.id and m.submitted_at is not null) as enviados
    from communities c
    where exists(select 1 from memberships m where m.community_id = c.id) order by c.name`;
  console.table(rows);
} else {
  const input = await buildEngineInput(id, { includeUnsubmitted: flag === '--all' });
  const dir = new URL('../out/', import.meta.url);
  await mkdir(dir, { recursive: true });
  const file = new URL(`engine-input-${id}.json`, dir);
  await writeFile(file, JSON.stringify(input, null, 2));
  const nParcels = input.participants.reduce((a, p) => a + p.parcels.length, 0);
  console.log(`✓ ${input.participants.length} agricultores, ${nParcels} parcelas → ${file.pathname}`);
}
await sql.end();
