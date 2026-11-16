import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { sql } from './db.ts';

export const SESSION_COOKIE = 'qullqa_session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Valida con zod; si falla, 400 con mensajes legibles. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
    throw new HttpError(400, msg);
  }
  return r.data;
}

/** actAs: id del administrador que está «viendo como» una familia demo. */
export type Session = { sub: string; name: string; actAs?: string };

/** Celulares con acceso al panel (ADMIN_PHONES, separados por coma). Se comparan los últimos 9 dígitos. */
const adminPhones = () => (process.env.ADMIN_PHONES ?? '').split(',').map((p) => p.replace(/\D/g, '').slice(-9)).filter((p) => p.length === 9);
export const isAdminPhone = (phone: string) => adminPhones().includes(phone.replace(/\D/g, '').slice(-9));

export async function requireAdmin(req: FastifyRequest): Promise<Session> {
  const s = await requireUser(req);
  if (s.actAs) throw new HttpError(403, 'Vuelve a tu cuenta de administrador para ver el panel');
  const [u] = await sql<{ phone: string }[]>`select phone from users where id = ${s.sub}`;
  if (!u || !isAdminPhone(u.phone)) throw new HttpError(404, 'No encontrado');
  return s;
}

export async function requireUser(req: FastifyRequest): Promise<Session> {
  try {
    return await req.jwtVerify<Session>();
  } catch {
    throw new HttpError(401, 'Inicia sesión');
  }
}

export async function requireMember(userId: string, communityId: string) {
  const [m] = await sql<{ role: string }[]>`
    select role from memberships where user_id = ${userId} and community_id = ${communityId}`;
  if (!m) throw new HttpError(403, 'No perteneces a esta comunidad');
  return m.role;
}

export async function requireParcelOwner(userId: string, parcelId: string) {
  const [p] = await sql<{ community_id: string }[]>`
    select community_id from parcels where id = ${parcelId} and owner_id = ${userId}`;
  // 404 y no 403: no revelamos si la parcela de otro existe
  if (!p) throw new HttpError(404, 'Parcela no encontrada');
  return p.community_id;
}

/** Editar parcelas o prioridades exige volver a enviar los datos. */
export async function clearSubmission(userId: string, communityId: string) {
  await sql`update memberships set submitted_at = null where user_id = ${userId} and community_id = ${communityId}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(v: string): string {
  if (!UUID_RE.test(v)) throw new HttpError(404, 'No encontrado');
  return v;
}
