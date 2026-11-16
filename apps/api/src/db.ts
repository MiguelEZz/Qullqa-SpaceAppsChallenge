import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL no está definida (revisa .env)');

export const sql = postgres(url, { max: 10, onnotice: () => {} });

/** Valor para una columna JSONB (o un parámetro jsonb) a partir de cualquier objeto serializable. */
export const json = (value: unknown) => sql.json(value as postgres.JSONValue);

/** Aplica en orden los .sql de /migrations que aún no se aplicaron. */
export async function migrate(): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const dir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await readFile(new URL(f, dir), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx.unsafe('insert into schema_migrations (name) values ($1)', [f]);
    });
    applied.push(f);
  }
  return applied;
}
