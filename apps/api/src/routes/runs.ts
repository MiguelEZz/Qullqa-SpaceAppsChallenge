import type { FastifyInstance } from 'fastify';
import { privateView, type PlanView, type RunResult } from '@qullqa/engine';
import type { EngineInput } from '@qullqa/shared';
import { json, sql } from '../db.ts';
import { buildEngineInput } from '../engineInput.ts';
import { HttpError, requireMember, requireUser, uuidParam } from '../http.ts';

/** Si en este tiempo nadie más de la comunidad envía datos, se calcula un plan personal. */
export const PERSONAL_PLAN_HOURS = Number(process.env.PERSONAL_PLAN_HOURS ?? 72);

export type RunKind = 'community' | 'incremental' | 'personal';

export interface PlanResponse {
  hasValleyData: boolean;
  submittedCount: number;
  memberCount: number;
  /** Cálculo en cola o en curso que incluye a este agricultor. */
  pending: { id: string; status: 'queued' | 'running'; createdAt: string } | null;
  /** Último plan de este agricultor (filtrado para él). */
  latest: { id: string; kind: RunKind; createdAt: string; finishedAt: string; durationMs: number; view: PlanView } | null;
  /** Envió sus datos y espera a sus vecinos: cuándo se hará su plan personal si nadie más envía. */
  waiting: { since: string; personalPlanAt: string; othersSubmitted: number } | null;
  lastError: string | null;
}

const ready = (input: EngineInput) => input.participants.filter((p) => p.preferences && p.parcels.length);

async function insertRun(communityId: string, valleyId: string, input: EngineInput, o: { kind: RunKind; requestedBy: string | null; target?: string | null; fixedPlans?: Record<string, string[]> | null }) {
  const seed = Math.floor(Math.random() * 2 ** 31); // queda guardada: la corrida es reproducible
  const [run] = await sql<{ id: string }[]>`
    insert into runs (community_id, requested_by, valley_id, seed, input, kind, target_user, fixed_plans)
    values (${communityId}, ${o.requestedBy}, ${valleyId}, ${seed}, ${json(input)}, ${o.kind}, ${o.target ?? null},
            ${o.fixedPlans ? json(o.fixedPlans) : null}) returning id`;
  await sql`select pg_notify('qullqa_runs', ${communityId})`;
  return run!;
}

/**
 * Plan comunitario completo con todos los que enviaron. Si ya hay uno en cola se actualiza su entrada
 * (varios envíos seguidos = una sola corrida). Lo usan el panel y la demo, y el primer plan de una comunidad.
 */
export async function enqueueRun(communityId: string, requestedBy: string | null): Promise<{ id: string } | null> {
  const [c] = await sql<{ valley_id: string | null }[]>`select valley_id from communities where id = ${communityId}`;
  if (!c?.valley_id) return null;
  const input = await buildEngineInput(communityId);
  if (!ready(input).length) return null;
  const [queued] = await sql<{ id: string }[]>`
    update runs set input = ${json(input)}, requested_by = ${requestedBy}, kind = 'community', target_user = null, fixed_plans = null
    where community_id = ${communityId} and status = 'queued' returning id`;
  if (queued) return queued;
  return insertRun(communityId, c.valley_id, input, { kind: 'community', requestedBy });
}

/**
 * Qué pasa cuando alguien pulsa «Enviar mis datos» (sin botón de «pedir plan»):
 *  - Es el único con datos → espera a sus vecinos; si en 3 días nadie envía, plan personal (ver schedulePersonalPlans).
 *  - La comunidad ya tiene plan → se calcula el suyo con el de los vecinos fijo (los demás no cambian).
 *  - Hay vecinos con datos pero aún no había plan → primer plan comunitario para todos.
 */
export async function onSubmitted(communityId: string, userId: string): Promise<'waiting' | 'incremental' | 'community' | 'no_valley'> {
  const [c] = await sql<{ valley_id: string | null }[]>`select valley_id from communities where id = ${communityId}`;
  if (!c?.valley_id) return 'no_valley';
  const input = await buildEngineInput(communityId);
  const others = ready(input).filter((p) => p.userId !== userId);
  if (!others.length) return 'waiting';

  const [last] = await sql<{ result: RunResult }[]>`
    select result from runs where community_id = ${communityId} and status = 'done' and kind in ('community', 'incremental')
    order by created_at desc limit 1`;
  const [queuedCommunity] = await sql<{ id: string }[]>`select id from runs where community_id = ${communityId} and status = 'queued' and kind = 'community'`;
  if (!last || queuedCommunity) {
    await enqueueRun(communityId, userId);
    return 'community';
  }
  // Planes de los vecinos que siguen con datos enviados: se mantienen tal cual
  const stillHere = new Set(others.flatMap((p) => p.parcels.map((x) => x.id)));
  const fixedPlans = Object.fromEntries(last.result.community.plan.filter((p) => p.ownerId !== userId && stillHere.has(p.parcelId)).map((p) => [p.parcelId, p.rotation]));
  await insertRun(communityId, c.valley_id, input, { kind: 'incremental', requestedBy: userId, target: userId, fixedPlans });
  return 'incremental';
}

/**
 * Planes personales: familias que enviaron datos hace ≥ 3 días, siguen solas y aún no tienen plan desde su envío.
 * Lo llama la API cada pocos minutos (server.ts).
 */
export async function schedulePersonalPlans(log: (m: string) => void = () => {}) {
  const due = await sql<{ user_id: string; community_id: string; valley_id: string }[]>`
    select m.user_id, m.community_id, c.valley_id from memberships m join communities c on c.id = m.community_id
    where m.submitted_at is not null and m.submitted_at <= now() - make_interval(hours => ${PERSONAL_PLAN_HOURS})
      and (m.last_plan_at is null or m.last_plan_at < m.submitted_at)
      and c.valley_id is not null
      and not exists (select 1 from runs r where r.community_id = m.community_id and r.status in ('queued', 'running'))`;
  for (const d of due) {
    const input = await buildEngineInput(d.community_id);
    const mine = { ...input, participants: input.participants.filter((p) => p.userId === d.user_id) };
    if (!ready(mine).length) continue;
    // Si mientras tanto otro vecino envió, corresponde el plan con la comunidad, no el personal
    if (ready(input).length > 1) { await onSubmitted(d.community_id, d.user_id); continue; }
    await insertRun(d.community_id, d.valley_id, mine, { kind: 'personal', requestedBy: null, target: d.user_id });
    log(`plan personal en cola para ${d.user_id}`);
  }
}

export async function runRoutes(app: FastifyInstance) {
  /**
   * Solo invitados (jurado): plan personal al momento, sin esperar a los vecinos ni los 3 días.
   * Usa solo los datos de esta familia; los planes de los demás no cambian.
   */
  app.post<{ Params: { id: string } }>('/api/communities/:id/plan/now', async (req) => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    const [u] = await sql<{ is_guest: boolean }[]>`select is_guest from users where id = ${s.sub}`;
    if (!u?.is_guest) throw new HttpError(403, 'Solo disponible en el modo invitado');
    const [c] = await sql<{ valley_id: string | null; submitted_at: Date | null }[]>`
      select c.valley_id, m.submitted_at from communities c join memberships m on m.community_id = c.id and m.user_id = ${s.sub} where c.id = ${id}`;
    if (!c?.valley_id) throw new HttpError(409, 'Esta comunidad todavía no tiene datos del valle');
    if (!c.submitted_at) throw new HttpError(409, 'Primero envía tus datos');
    const busy = json([{ userId: s.sub }]);
    const [pending] = await sql<{ id: string }[]>`
      select id from runs where community_id = ${id} and status in ('queued', 'running') and input->'participants' @> ${busy} limit 1`;
    if (pending) return { id: pending.id };
    const input = await buildEngineInput(id);
    const mine = { ...input, participants: input.participants.filter((p) => p.userId === s.sub) };
    if (!ready(mine).length) throw new HttpError(409, 'Faltan tu chacra o lo que te importa');
    return insertRun(id, c.valley_id, mine, { kind: 'personal', requestedBy: s.sub, target: s.sub });
  });

  app.get<{ Params: { id: string } }>('/api/communities/:id/plan', async (req): Promise<PlanResponse> => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    const me = json([{ userId: s.sub }]);
    const [c] = await sql<{ valley_id: string | null; submitted: number; members: number; my_submit: Date | null; my_last_plan: Date | null }[]>`
      select valley_id,
        (select count(*)::int from memberships where community_id = c.id and submitted_at is not null) as submitted,
        (select count(*)::int from memberships where community_id = c.id) as members,
        (select submitted_at from memberships where community_id = c.id and user_id = ${s.sub}) as my_submit,
        (select last_plan_at from memberships where community_id = c.id and user_id = ${s.sub}) as my_last_plan
      from communities c where c.id = ${id}`;
    // Solo cálculos que INCLUYEN a este agricultor
    const [pending] = await sql<{ id: string; status: 'queued' | 'running'; created_at: Date }[]>`
      select id, status, created_at from runs where community_id = ${id} and status in ('queued', 'running')
        and input->'participants' @> ${me} order by created_at limit 1`;
    const [done] = await sql<{ id: string; kind: RunKind; created_at: Date; finished_at: Date; duration_ms: number; result: RunResult }[]>`
      select id, kind, created_at, finished_at, duration_ms, result from runs where community_id = ${id} and status = 'done'
        and input->'participants' @> ${me} order by created_at desc limit 1`;
    if (done && !s.actAs) await sql`update memberships set plan_viewed_at = now() where user_id = ${s.sub} and community_id = ${id}`;
    const [failed] = await sql<{ created_at: Date }[]>`
      select created_at from runs where community_id = ${id} and status = 'failed' and input->'participants' @> ${me} order by created_at desc limit 1`;
    const waitingNow = !!c?.my_submit && !pending && (!c.my_last_plan || c.my_last_plan < c.my_submit);
    return {
      hasValleyData: !!c?.valley_id,
      submittedCount: c?.submitted ?? 0,
      memberCount: c?.members ?? 0,
      pending: pending ? { id: pending.id, status: pending.status, createdAt: pending.created_at.toISOString() } : null,
      latest: done
        ? { id: done.id, kind: done.kind, createdAt: done.created_at.toISOString(), finishedAt: done.finished_at.toISOString(), durationMs: done.duration_ms, view: privateView(done.result, s.sub) }
        : null,
      waiting: waitingNow && c?.valley_id
        ? { since: c.my_submit!.toISOString(), personalPlanAt: new Date(c.my_submit!.getTime() + PERSONAL_PLAN_HOURS * 3600_000).toISOString(), othersSubmitted: Math.max(0, (c.submitted ?? 1) - 1) }
        : null,
      lastError: failed && (!done || failed.created_at > done.created_at) ? 'Hubo un problema al calcular tu plan. Lo volveremos a intentar.' : null,
    };
  });
}
