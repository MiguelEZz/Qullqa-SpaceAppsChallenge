import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { HealthResponse } from '@qullqa/shared';
import { sql } from './db.ts';
import { HttpError, SESSION_COOKIE } from './http.ts';
import { authRoutes } from './routes/auth.ts';
import { communityRoutes } from './routes/communities.ts';
import { parcelRoutes } from './routes/parcels.ts';
import { preferenceRoutes } from './routes/preferences.ts';
import { runRoutes } from './routes/runs.ts';
import { adminRoutes } from './routes/admin.ts';
import { notificationRoutes } from './routes/notifications.ts';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET falta o es muy corto (revisa .env)');

  const app = Fastify({
    logger: opts.logger === false ? false : { level: 'info' },
    trustProxy: true,
    bodyLimit: 1024 * 1024, // fotos en miniatura (≤ ~300 KB)
  });

  // Acepta POST con Content-Type JSON y cuerpo vacío (algunos clientes lo envían así)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new HttpError(400, 'JSON inválido'), undefined);
    }
  });

  await app.register(cookie);
  await app.register(jwt, { secret, cookie: { cookieName: SESSION_COOKIE, signed: false } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'Error interno del servidor' });
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    let db: HealthResponse['db'] = { ok: false, postgis: null };
    try {
      const [row] = await sql<{ v: string }[]>`select postgis_lib_version() as v`;
      db = { ok: true, postgis: row?.v ?? null };
    } catch (err) {
      app.log.error(err, 'db health check failed');
    }
    return { ok: db.ok, service: 'qullqa-api', db, time: new Date().toISOString() };
  });

  await app.register(authRoutes);
  await app.register(communityRoutes);
  await app.register(parcelRoutes);
  await app.register(preferenceRoutes);
  await app.register(runRoutes);
  await app.register(adminRoutes);
  await app.register(notificationRoutes);

  return app;
}
