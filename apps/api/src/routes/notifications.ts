import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.ts';
import { parse, requireUser } from '../http.ts';

export interface NotificationView { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }

const PushSubscriptionBody = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** Avisos dentro de la app y suscripción a notificaciones del celular (Web Push). */
export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (req): Promise<{ unread: number; items: NotificationView[] }> => {
    const s = await requireUser(req);
    const rows = await sql<{ id: string; kind: string; title: string; body: string; link: string | null; created_at: Date; read_at: Date | null }[]>`
      select id, kind, title, body, link, created_at, read_at from notifications where user_id = ${s.sub} order by created_at desc limit 30`;
    return {
      unread: rows.filter((r) => !r.read_at).length,
      items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.created_at.toISOString(), read: !!r.read_at })),
    };
  });

  app.post('/api/notifications/read', async (req) => {
    const s = await requireUser(req);
    if (!s.actAs) await sql`update notifications set read_at = now() where user_id = ${s.sub} and read_at is null`;
    return { ok: true };
  });

  /** Clave pública VAPID para suscribirse (vacía si el servidor no tiene notificaciones configuradas). */
  app.get('/api/push/key', async () => ({ key: process.env.VAPID_PUBLIC_KEY ?? '' }));

  app.post('/api/push/subscribe', async (req) => {
    const s = await requireUser(req);
    const sub = parse(PushSubscriptionBody, req.body);
    await sql`insert into push_subscriptions (endpoint, user_id, keys) values (${sub.endpoint}, ${s.sub}, ${sql.json(sub.keys)})
              on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys`;
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const s = await requireUser(req);
    const { endpoint } = parse(z.object({ endpoint: z.string().url() }), req.body);
    await sql`delete from push_subscriptions where endpoint = ${endpoint} and user_id = ${s.sub}`;
    return { ok: true };
  });
}
