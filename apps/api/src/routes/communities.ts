import type { FastifyInstance } from 'fastify';
import type { CommunitySummary, CommunityView, LonLat, Readiness } from '@qullqa/shared';
import { sql } from '../db.ts';
import { onSubmitted } from './runs.ts';
import { HttpError, requireMember, requireUser, uuidParam } from '../http.ts';

/** Minúsculas y sin tildes, para buscar «Cabanaconde» escribiendo «cabana». */
const normalize = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export async function readinessFor(userId: string, communityId: string): Promise<Readiness> {
  const [r] = await sql<{ parcels: number; prefs: number; submitted_at: Date | null }[]>`
    select
      (select count(*)::int from parcels where owner_id = ${userId} and community_id = ${communityId}) as parcels,
      (select count(*)::int from preferences where user_id = ${userId} and community_id = ${communityId}) as prefs,
      (select submitted_at from memberships where user_id = ${userId} and community_id = ${communityId}) as submitted_at`;
  const types = await sql<{ type: string }[]>`
    select distinct o.type from observations o join parcels p on p.id = o.parcel_id
    where p.owner_id = ${userId} and p.community_id = ${communityId}`;
  const hasParcel = (r?.parcels ?? 0) > 0;
  const preferencesSaved = (r?.prefs ?? 0) > 0;
  return {
    hasParcel,
    rotationsComplete: hasParcel, // la rotación es obligatoria al crear la parcela
    preferencesSaved,
    observationTypes: types.map((t) => t.type),
    canSubmit: hasParcel && preferencesSaved,
    submittedAt: r?.submitted_at ? r.submitted_at.toISOString() : null,
  };
}

export async function communityRoutes(app: FastifyInstance) {
  /**
   * Buscador de comunidades (catálogo fijo). Público: solo nombre, ubicación y cuántos se unieron.
   * La búsqueda ignora tildes y mayúsculas («cabana» encuentra «Cabanaconde»).
   */
  app.get<{ Querystring: { q?: string } }>('/api/communities', async (req): Promise<CommunitySummary[]> => {
    let userId: string | null = null;
    try { userId = (await req.jwtVerify<{ sub: string }>()).sub; } catch { /* sin sesión: igual se puede buscar */ }
    const rows = await sql<{ id: string; slug: string; name: string; district: string; province: string; region: string; altitude_m: number | null; members: number; valley_id: string | null; is_member: boolean }[]>`
      select c.id, c.slug, c.name, c.district, c.province, c.region, c.altitude_m, c.valley_id,
        (select count(*)::int from memberships m where m.community_id = c.id) as members,
        exists(select 1 from memberships m where m.community_id = c.id and m.user_id = ${userId}) as is_member
      from communities c where c.listed order by c.name`;
    const q = normalize(String(req.query.q ?? ''));
    return rows
      .filter((r) => !q || [r.name, r.district, r.province].some((t) => normalize(t).includes(q)))
      .sort((a, b) => (q ? Number(!normalize(a.name).startsWith(q)) - Number(!normalize(b.name).startsWith(q)) : 0) || b.members - a.members || a.name.localeCompare(b.name, 'es'))
      .map((r) => ({
        id: r.id, slug: r.slug, name: r.name, district: r.district, province: r.province, region: r.region,
        altitudeM: r.altitude_m, memberCount: r.members, hasValleyData: !!r.valley_id, isMember: r.is_member,
      }));
  });

  app.get<{ Params: { slug: string } }>('/api/communities/by-slug/:slug', async (req): Promise<CommunitySummary> => {
    let userId: string | null = null;
    try { userId = (await req.jwtVerify<{ sub: string }>()).sub; } catch { /* público */ }
    const [r] = await sql<{ id: string; slug: string; name: string; district: string; province: string; region: string; altitude_m: number | null; members: number; valley_id: string | null; is_member: boolean }[]>`
      select c.id, c.slug, c.name, c.district, c.province, c.region, c.altitude_m, c.valley_id,
        (select count(*)::int from memberships m where m.community_id = c.id) as members,
        exists(select 1 from memberships m where m.community_id = c.id and m.user_id = ${userId}) as is_member
      from communities c where c.listed and c.slug = ${req.params.slug}`;
    if (!r) throw new HttpError(404, 'No encontramos esa comunidad');
    return { id: r.id, slug: r.slug, name: r.name, district: r.district, province: r.province, region: r.region,
      altitudeM: r.altitude_m, memberCount: r.members, hasValleyData: !!r.valley_id, isMember: r.is_member };
  });

  /** Unirse: cualquier agricultor puede sumarse a una comunidad del catálogo. No hay líder ni código. */
  app.post<{ Params: { id: string } }>('/api/communities/:id/join', async (req) => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    const [c] = await sql<{ id: string; name: string }[]>`select id, name from communities where id = ${id} and listed`;
    if (!c) throw new HttpError(404, 'No encontramos esa comunidad');
    await sql`insert into memberships (user_id, community_id) values (${s.sub}, ${c.id}) on conflict do nothing`;
    return { id: c.id, name: c.name };
  });

  /** Salir: borra mis parcelas, observaciones y prioridades en esa comunidad (son mías, no de la comunidad). */
  app.post<{ Params: { id: string } }>('/api/communities/:id/leave', async (req) => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    await sql.begin(async (tx) => {
      await tx`delete from parcels where owner_id = ${s.sub} and community_id = ${id}`;
      await tx`delete from preferences where user_id = ${s.sub} and community_id = ${id}`;
      await tx`delete from memberships where user_id = ${s.sub} and community_id = ${id}`;
    });
    return { ok: true };
  });

  /** Vista pública para miembros: agregados + geometrías. Nunca preferencias ni observaciones ajenas. */
  app.get<{ Params: { id: string } }>('/api/communities/:id', async (req): Promise<CommunityView> => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    const [c] = await sql<{ id: string; slug: string | null; name: string; district: string | null; province: string | null; valley_id: string | null; lon: number; lat: number; members: number; submitted: number }[]>`
      select c.id, c.slug, c.name, c.district, c.province, c.valley_id,
        ST_X(c.center::geometry) as lon, ST_Y(c.center::geometry) as lat,
        (select count(*)::int from memberships where community_id = c.id) as members,
        (select count(*)::int from memberships where community_id = c.id and submitted_at is not null) as submitted
      from communities c where c.id = ${id}`;
    if (!c) throw new HttpError(404, 'Comunidad no encontrada');
    const parcels = await sql<{ id: string; geo: { coordinates: LonLat[][] }; area_ha: number; mine: boolean }[]>`
      select id, ST_AsGeoJSON(polygon)::json as geo, ST_Area(polygon) / 10000 as area_ha, owner_id = ${s.sub} as mine
      from parcels where community_id = ${id} order by created_at`;
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      district: c.district,
      province: c.province,
      hasValleyData: !!c.valley_id,
      center: [c.lon, c.lat],
      memberCount: c.members,
      submittedCount: c.submitted,
      parcels: parcels.map((p) => ({
        id: p.id,
        ring: (p.geo.coordinates[0] ?? []).slice(0, -1),
        areaHa: Math.round(p.area_ha * 1000) / 1000,
        mine: p.mine,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/api/communities/:id/readiness', async (req) => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    return readinessFor(s.sub, id);
  });

  /** «Enviar mis datos»: marca al agricultor como listo para la próxima corrida del cerebro. */
  app.post<{ Params: { id: string } }>('/api/communities/:id/submit', async (req) => {
    const s = await requireUser(req);
    const id = uuidParam(req.params.id);
    await requireMember(s.sub, id);
    const r = await readinessFor(s.sub, id);
    if (!r.canSubmit) throw new HttpError(400, 'Falta registrar al menos una parcela y tus prioridades');
    await sql`update memberships set submitted_at = now() where user_id = ${s.sub} and community_id = ${id}`;
    // Sin botón de «pedir plan»: según cuántos vecinos enviaron, espera, se suma al plan existente o se hace el primero
    await onSubmitted(id, s.sub).catch((err) => req.log.error(err, 'no se pudo encolar el cálculo'));
    return readinessFor(s.sub, id);
  });
}
