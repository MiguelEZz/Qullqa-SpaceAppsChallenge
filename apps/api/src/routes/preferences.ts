import type { FastifyInstance } from 'fastify';
import { PreferencesBody, type PreferencesView } from '@qullqa/shared';
import { ASSUMPTIONS, coinsFromFocus } from '@qullqa/catalog';
import { sql } from '../db.ts';
import { clearSubmission, parse, requireMember, requireUser, uuidParam } from '../http.ts';

/** Prioridades y restricciones: PRIVADAS. Solo el dueño las lee; el cerebro las recibe vía EngineInput. */
export async function preferenceRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/communities/:id/preferences', async (req) => {
    const s = await requireUser(req);
    const cid = uuidParam(req.params.id);
    await requireMember(s.sub, cid);
    const [row] = await sql<{ focus: string[]; coins: unknown; coins_source: 'cards' | 'manual'; constraints: unknown; vetoes: string[] }[]>`
      select focus, coins, coins_source, constraints, vetoes from preferences where user_id = ${s.sub} and community_id = ${cid}`;
    return row ? ({ focus: row.focus, coins: row.coins, coinsSource: row.coins_source, constraints: row.constraints, vetoes: row.vetoes } as PreferencesView) : null;
  });

  app.put<{ Params: { id: string } }>('/api/communities/:id/preferences', async (req) => {
    const s = await requireUser(req);
    const cid = uuidParam(req.params.id);
    await requireMember(s.sub, cid);
    const body = parse(PreferencesBody, req.body);
    // Monedas a mano mandan; si no, se deducen de las tarjetas + lo que ya contó (supuesto editable del catálogo)
    let coins = body.coins;
    const source: 'cards' | 'manual' = body.coins ? 'manual' : 'cards';
    if (!coins) {
      const [r] = await sql<{ rainfed: boolean }[]>`
        select exists(select 1 from parcels where owner_id = ${s.sub} and community_id = ${cid} and irrigation->>'source' = 'none') as rainfed`;
      coins = coinsFromFocus(body.focus!, { livestockHeads: body.constraints.livestockHeads, market: body.constraints.market, hasRainfedParcel: !!r?.rainfed }, ASSUMPTIONS);
    }
    const focus = body.focus ?? [];
    await sql`
      insert into preferences (user_id, community_id, focus, coins, coins_source, constraints, vetoes)
      values (${s.sub}, ${cid}, ${focus}, ${sql.json(coins)}, ${source}, ${sql.json(body.constraints)}, ${body.vetoes})
      on conflict (user_id, community_id) do update
        set focus = excluded.focus, coins = excluded.coins, coins_source = excluded.coins_source,
            constraints = excluded.constraints, vetoes = excluded.vetoes, updated_at = now()`;
    await clearSubmission(s.sub, cid);
    return { focus, coins, coinsSource: source, constraints: body.constraints, vetoes: body.vetoes } as PreferencesView;
  });
}
