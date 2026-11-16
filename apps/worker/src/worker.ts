/**
 * Worker del cerebro: toma corridas en cola (tabla runs), arma el snapshot inmutable, ejecuta runCommunity,
 * guarda el resultado y AVISA a las familias (en la app y, si dieron permiso, en el celular).
 * Varios workers pueden correr a la vez (SKIP LOCKED).
 */
import postgres from 'postgres';
import webpush from 'web-push';
import { ASSUMPTIONS, CROPS } from '@qullqa/catalog';
import { ENGINE_VERSION, makeSnapshot, runCommunity, type Rotation } from '@qullqa/engine';
import type { EngineInput } from '@qullqa/shared';
import { loadValley } from './valleys.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL no está definida (revisa .env)');
const sql = postgres(url, { max: 3, onnotice: () => {} });
const json = (value: unknown) => sql.json(value as postgres.JSONValue);
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

// Notificaciones del celular (Web Push): solo si hay claves VAPID en el entorno
const pushReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contacto@qullqa.us', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

type Kind = 'community' | 'incremental' | 'personal';
type Job = { id: string; community_id: string; valley_id: string; seed: number; input: EngineInput; kind: Kind; target_user: string | null; fixed_plans: Record<string, Rotation> | null };

async function claim(): Promise<Job | null> {
  const [job] = await sql<Job[]>`
    update runs set status = 'running', started_at = now()
    where id = (select id from runs where status = 'queued' order by created_at for update skip locked limit 1)
    returning id, community_id, valley_id, seed, input, kind, target_user, fixed_plans`;
  return job ?? null;
}

/** Aviso en la app + push al celular. */
async function notify(userId: string, communityId: string, kind: string, title: string, body: string, link: string) {
  await sql`insert into notifications (user_id, community_id, kind, title, body, link) values (${userId}, ${communityId}, ${kind}, ${title}, ${body}, ${link})`;
  if (!pushReady) return;
  const subs = await sql<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>`select endpoint, keys from push_subscriptions where user_id = ${userId}`;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, url: link }), { TTL: 3 * 24 * 3600 });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`; // suscripción vencida
      else log('push falló', { code });
    }
  }
}

async function runJob(job: Job) {
  const t0 = performance.now();
  try {
    const valley = loadValley(job.valley_id);
    const snap = makeSnapshot(job.input, valley, CROPS, ASSUMPTIONS, job.seed, undefined, job.fixed_plans ?? undefined);
    const result = runCommunity(snap);
    const ms = Math.round(performance.now() - t0);
    // Snapshot: la entrada ya está en runs.input; aquí guardamos versiones, catálogo, supuestos y planes fijos usados.
    const meta = { engineVersion: ENGINE_VERSION, valleyId: valley.id, valleyVersion: valley.version, seed: job.seed, kind: job.kind, crops: snap.crops, assumptions: snap.assumptions, fixedPlans: job.fixed_plans };
    await sql`
      update runs set status = 'done', result = ${json(result)}, snapshot_meta = ${json(meta)},
        duration_ms = ${ms}, finished_at = now()
      where id = ${job.id}`;

    // Quién recibió plan y a quién avisar
    const users = result.participants.map((p) => p.userId);
    if (users.length) await sql`update memberships set last_plan_at = now() where community_id = ${job.community_id} and user_id in ${sql(users)}`;
    const link = `/c/${job.community_id}/plan`;
    const n = users.length;
    if (job.kind === 'personal' && job.target_user) {
      await notify(job.target_user, job.community_id, 'plan_personal', 'Tu plan de siembra está listo',
        'Como nadie más de tu comunidad envió sus datos todavía, te hicimos un plan personal. Cuando tus vecinos envíen los suyos, haremos el plan de la comunidad.', link);
    } else if (job.kind === 'incremental' && job.target_user) {
      await notify(job.target_user, job.community_id, 'plan_ready', 'Tu plan de siembra está listo',
        `Calculamos tu plan junto al de tu comunidad (${n} familias). Los planes de tus vecinos no cambiaron.`, link);
    } else {
      for (const u of users) {
        await notify(u, job.community_id, 'plan_ready', 'El plan de tu comunidad está listo',
          `${n} familias enviaron sus datos y calculamos el plan juntos. Mira qué te conviene sembrar.`, link);
      }
    }
    await sql`select pg_notify('qullqa_run_done', ${job.community_id})`;
    log('corrida lista', { run: job.id, kind: job.kind, ms, participants: n });
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    log('corrida falló', { run: job.id, error: (err as Error).message });
    await sql`update runs set status = 'failed', error = ${(err as Error).message.slice(0, 500)}, duration_ms = ${ms}, finished_at = now() where id = ${job.id}`;
  }
}

let busy = false;
async function drain() {
  if (busy) return;
  busy = true;
  try {
    for (let job = await claim(); job; job = await claim()) await runJob(job);
  } catch (err) {
    log('error leyendo la cola', { error: (err as Error).message });
  } finally {
    busy = false;
  }
}

// Si el worker murió a mitad de una corrida, vuelve a la cola.
const reset = await sql`update runs set status = 'queued', started_at = null where status = 'running' returning id`;
if (reset.length) log('corridas reencoladas tras reinicio', { n: reset.length });

await sql.listen('qullqa_runs', () => void drain());
setInterval(() => void drain(), 5000); // respaldo por si se pierde una notificación
log('worker listo', { engine: ENGINE_VERSION, push: pushReady });
void drain();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
