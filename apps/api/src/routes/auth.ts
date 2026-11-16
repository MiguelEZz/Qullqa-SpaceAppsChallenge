import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ChangePinBody, ConfirmPinBody, LoginBody, RegisterBody, ResetPinBody, TERMS_VERSION, UpdateMeBody, type AuthResult, type Me,
} from '@qullqa/shared';
import { sql } from '../db.ts';
import { HttpError, SESSION_COOKIE, isAdminPhone, parse, requireUser } from '../http.ts';
import { clearFailures, hashPin, isLocked, recordFailure, recoveryCode, verifyPin } from '../security.ts';

const NINETY_DAYS = 90 * 24 * 3600;

export async function startSession(reply: FastifyReply, user: { id: string; name: string }, actAs?: string) {
  const token = await reply.jwtSign({ sub: user.id, name: user.name, ...(actAs ? { actAs } : {}) }, { expiresIn: actAs ? 12 * 3600 : NINETY_DAYS });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: true, // los navegadores aceptan Secure en http://localhost
    sameSite: 'lax',
    maxAge: NINETY_DAYS,
  });
}

/** Comprueba el PIN del usuario en sesión (para acciones sensibles), con el mismo límite de intentos. */
async function checkOwnPin(userId: string, pin: string) {
  const key = `user:${userId}`;
  if (isLocked(key)) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos.');
  const [u] = await sql<{ pin_hash: string }[]>`select pin_hash from users where id = ${userId}`;
  if (!u || !(await verifyPin(pin, u.pin_hash))) {
    recordFailure(key);
    throw new HttpError(401, 'PIN incorrecto');
  }
  clearFailures(key);
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply): Promise<AuthResult> => {
    const body = parse(RegisterBody, req.body);
    const pinHash = await hashPin(body.pin);
    const code = recoveryCode();
    const [user] = await sql<{ id: string; name: string }[]>`
      insert into users (name, phone, pin_hash, recovery_hash, terms_accepted_at, terms_version)
      values (${body.name}, ${body.phone}, ${pinHash}, ${await hashPin(code.plain)}, now(), ${TERMS_VERSION})
      on conflict (phone) do nothing
      returning id, name`;
    if (!user) throw new HttpError(409, 'Ese número ya está registrado. Ingresa con tu PIN.');
    await startSession(reply, user);
    return { id: user.id, name: user.name, recoveryCode: code.display };
  });

  app.post('/api/auth/login', async (req, reply): Promise<AuthResult> => {
    const body = parse(LoginBody, req.body);
    if (isLocked(body.phone)) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos.');
    const [user] = await sql<{ id: string; name: string; pin_hash: string }[]>`
      select id, name, pin_hash from users where phone = ${body.phone}`;
    if (!user || !(await verifyPin(body.pin, user.pin_hash))) {
      recordFailure(body.phone);
      throw new HttpError(401, 'Número o PIN incorrecto');
    }
    clearFailures(body.phone);
    await startSession(reply, user);
    return { id: user.id, name: user.name };
  });

  /**
   * «Olvidé mi PIN»: celular + código de recuperación → PIN nuevo. El código se gasta y se entrega otro.
   * No usamos SMS (no hay proveedor); el código se mostró una sola vez al crear la cuenta.
   */
  app.post('/api/auth/reset-pin', async (req, reply): Promise<AuthResult> => {
    const body = parse(ResetPinBody, req.body);
    const key = `reset:${body.phone}`;
    if (isLocked(key)) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos.');
    const [user] = await sql<{ id: string; name: string; recovery_hash: string | null }[]>`
      select id, name, recovery_hash from users where phone = ${body.phone}`;
    if (!user?.recovery_hash || !(await verifyPin(body.recoveryCode, user.recovery_hash))) {
      recordFailure(key);
      throw new HttpError(401, 'El número o el código de recuperación no coinciden');
    }
    clearFailures(key);
    clearFailures(body.phone);
    const code = recoveryCode();
    await sql`update users set pin_hash = ${await hashPin(body.newPin)}, recovery_hash = ${await hashPin(code.plain)} where id = ${user.id}`;
    await startSession(reply, user);
    return { id: user.id, name: user.name, recoveryCode: code.display };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req): Promise<Me> => {
    const s = await requireUser(req);
    // «Última vez activo» (no cuenta cuando un administrador mira como una familia demo)
    const [user] = await sql<{ id: string; name: string; phone: string; created_at: Date }[]>`
      update users set last_seen_at = case when ${!!s.actAs} then last_seen_at else now() end
      where id = ${s.sub} returning id, name, phone, created_at`;
    if (!user) throw new HttpError(401, 'Inicia sesión');
    const communities = await sql<Me['communities']>`
      select c.id, c.name, c.slug from memberships m join communities c on c.id = m.community_id
      where m.user_id = ${s.sub} order by m.joined_at`;
    let actingFor: Me['actingFor'] = null;
    if (s.actAs) {
      const [admin] = await sql<{ name: string }[]>`select name from users where id = ${s.actAs}`;
      actingFor = admin ? { adminName: admin.name } : null;
    }
    return {
      id: user.id, name: user.name, phoneHint: user.phone.slice(-3), createdAt: user.created_at.toISOString(), communities: [...communities],
      isAdmin: !s.actAs && isAdminPhone(user.phone), actingFor,
    };
  });

  /** Termina el «ver como» y vuelve a la sesión del administrador. */
  app.post('/api/auth/stop-acting', async (req, reply) => {
    const s = await requireUser(req);
    if (!s.actAs) throw new HttpError(400, 'No estás viendo como otra persona');
    const [admin] = await sql<{ id: string; name: string; phone: string }[]>`select id, name, phone from users where id = ${s.actAs}`;
    if (!admin || !isAdminPhone(admin.phone)) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      throw new HttpError(401, 'Inicia sesión');
    }
    await startSession(reply, admin);
    return { ok: true };
  });

  app.patch('/api/me', async (req, reply) => {
    const s = await requireUser(req);
    const { name } = parse(UpdateMeBody, req.body);
    const [user] = await sql<{ id: string; name: string }[]>`update users set name = ${name} where id = ${s.sub} returning id, name`;
    if (!user) throw new HttpError(401, 'Inicia sesión');
    await startSession(reply, user); // el nombre viaja en la sesión
    return user;
  });

  app.post('/api/me/pin', async (req) => {
    const s = await requireUser(req);
    const body = parse(ChangePinBody, req.body);
    await checkOwnPin(s.sub, body.currentPin);
    await sql`update users set pin_hash = ${await hashPin(body.newPin)} where id = ${s.sub}`;
    return { ok: true };
  });

  /** Genera un código de recuperación nuevo (el anterior deja de servir). Pide el PIN actual. */
  app.post('/api/me/recovery-code', async (req): Promise<{ recoveryCode: string }> => {
    const s = await requireUser(req);
    const { pin } = parse(ConfirmPinBody, req.body);
    await checkOwnPin(s.sub, pin);
    const code = recoveryCode();
    await sql`update users set recovery_hash = ${await hashPin(code.plain)} where id = ${s.sub}`;
    return { recoveryCode: code.display };
  });

  /** Borrar mi cuenta: elimina usuario, parcelas, observaciones, fotos y prioridades (en cascada). */
  app.post('/api/me/delete', async (req, reply) => {
    const s = await requireUser(req);
    const { pin } = parse(ConfirmPinBody, req.body);
    await checkOwnPin(s.sub, pin);
    await sql`delete from users where id = ${s.sub}`;
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
