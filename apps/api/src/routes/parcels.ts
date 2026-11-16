import type { FastifyInstance } from 'fastify';
import {
  ObservationBody,
  ParcelBody,
  ParcelPatch,
  type LonLat,
  type Observation,
  type Parcel,
  type Ring,
} from '@qullqa/shared';
import { sql } from '../db.ts';
import { HttpError, clearSubmission, parse, requireMember, requireParcelOwner, requireUser, uuidParam } from '../http.ts';

const MAX_DISTANCE_M = 40_000; // la parcela debe estar en el valle de la comunidad
const MIN_AREA_M2 = 20;
const MAX_AREA_HA = 100;

function toGeoJson(ring: Ring) {
  const first = ring[0]!;
  return JSON.stringify({ type: 'Polygon', coordinates: [[...ring, first]] });
}

/** Verifica que el contorno sea válido, razonable y esté cerca de la comunidad. */
async function checkRing(ring: Ring, communityId: string) {
  const geo = toGeoJson(ring);
  const [g] = await sql<{ valid: boolean; area_m2: number; dist_m: number }[]>`
    select ST_IsValid(ST_GeomFromGeoJSON(${geo})) as valid,
           ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)::geography) as area_m2,
           ST_Distance(ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)::geography, c.center) as dist_m
    from communities c where c.id = ${communityId}`;
  if (!g) throw new HttpError(404, 'Comunidad no encontrada');
  if (!g.valid) throw new HttpError(400, 'El contorno se cruza consigo mismo. Vuelve a trazarlo.');
  if (g.area_m2 < MIN_AREA_M2) throw new HttpError(400, 'La parcela es demasiado pequeña (menos de 20 m²).');
  if (g.area_m2 > MAX_AREA_HA * 10_000) throw new HttpError(400, `La parcela supera ${MAX_AREA_HA} ha. ¿Trazaste bien el borde?`);
  if (g.dist_m > MAX_DISTANCE_M) throw new HttpError(400, 'La parcela está a más de 40 km de la comunidad.');
  return geo;
}

type ParcelRow = {
  id: string;
  community_id: string;
  name: string;
  geo: { coordinates: LonLat[][] };
  capture_method: 'walk' | 'draw';
  gps_altitude_m: number | null;
  gps_accuracy_m: number | null;
  irrigation: Parcel['irrigation'];
  current_rotation: string[];
  area_ha: number;
  obs: number;
  created_at: Date;
};

function toParcel(r: ParcelRow): Parcel {
  return {
    id: r.id,
    communityId: r.community_id,
    name: r.name,
    ring: (r.geo.coordinates[0] ?? []).slice(0, -1),
    captureMethod: r.capture_method,
    gps: { altitudeM: r.gps_altitude_m, accuracyM: r.gps_accuracy_m },
    irrigation: r.irrigation,
    currentRotation: r.current_rotation as Parcel['currentRotation'],
    areaHa: Math.round(r.area_ha * 1000) / 1000,
    observationCount: r.obs,
    createdAt: r.created_at.toISOString(),
  };
}

const selectParcel = (where: ReturnType<typeof sql>) => sql<ParcelRow[]>`
  select p.id, p.community_id, p.name, ST_AsGeoJSON(p.polygon)::json as geo, p.capture_method,
         p.gps_altitude_m, p.gps_accuracy_m, p.irrigation, p.current_rotation,
         ST_Area(p.polygon) / 10000 as area_ha,
         (select count(*)::int from observations o where o.parcel_id = p.id) as obs,
         p.created_at
  from parcels p where ${where} order by p.created_at`;

export async function parcelRoutes(app: FastifyInstance) {
  /** Mis parcelas en una comunidad (solo las mías). */
  app.get<{ Params: { id: string } }>('/api/communities/:id/my-parcels', async (req) => {
    const s = await requireUser(req);
    const cid = uuidParam(req.params.id);
    await requireMember(s.sub, cid);
    const rows = await selectParcel(sql`p.community_id = ${cid} and p.owner_id = ${s.sub}`);
    return rows.map(toParcel);
  });

  app.get<{ Params: { id: string } }>('/api/parcels/:id', async (req) => {
    const s = await requireUser(req);
    const pid = uuidParam(req.params.id);
    await requireParcelOwner(s.sub, pid);
    const [row] = await selectParcel(sql`p.id = ${pid}`);
    return toParcel(row!);
  });

  app.post('/api/parcels', async (req) => {
    const s = await requireUser(req);
    const body = parse(ParcelBody, req.body);
    await requireMember(s.sub, body.communityId);
    const geo = await checkRing(body.ring, body.communityId);
    const [row] = await sql<{ id: string }[]>`
      insert into parcels (community_id, owner_id, name, polygon, capture_method, gps_altitude_m, gps_accuracy_m,
                           irrigation, current_rotation)
      values (${body.communityId}, ${s.sub}, ${body.name}, ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)::geography,
              ${body.captureMethod}, ${body.gps?.altitudeM ?? null}, ${body.gps?.accuracyM ?? null},
              ${sql.json(body.irrigation)}, ${body.currentRotation})
      returning id`;
    await clearSubmission(s.sub, body.communityId);
    const [created] = await selectParcel(sql`p.id = ${row!.id}`);
    return toParcel(created!);
  });

  app.patch<{ Params: { id: string } }>('/api/parcels/:id', async (req) => {
    const s = await requireUser(req);
    const pid = uuidParam(req.params.id);
    const cid = await requireParcelOwner(s.sub, pid);
    const body = parse(ParcelPatch, req.body);
    if (body.name !== undefined) await sql`update parcels set name = ${body.name} where id = ${pid}`;
    if (body.ring !== undefined) {
      const geo = await checkRing(body.ring, cid);
      await sql`update parcels set polygon = ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)::geography,
                capture_method = ${body.captureMethod ?? 'draw'} where id = ${pid}`;
    }
    if (body.gps !== undefined)
      await sql`update parcels set gps_altitude_m = ${body.gps.altitudeM}, gps_accuracy_m = ${body.gps.accuracyM} where id = ${pid}`;
    if (body.irrigation !== undefined) await sql`update parcels set irrigation = ${sql.json(body.irrigation)} where id = ${pid}`;
    if (body.currentRotation !== undefined)
      await sql`update parcels set current_rotation = ${body.currentRotation} where id = ${pid}`;
    await sql`update parcels set updated_at = now() where id = ${pid}`;
    await clearSubmission(s.sub, cid);
    const [row] = await selectParcel(sql`p.id = ${pid}`);
    return toParcel(row!);
  });

  app.delete<{ Params: { id: string } }>('/api/parcels/:id', async (req) => {
    const s = await requireUser(req);
    const pid = uuidParam(req.params.id);
    const cid = await requireParcelOwner(s.sub, pid);
    await sql`delete from parcels where id = ${pid}`;
    await clearSubmission(s.sub, cid);
    return { ok: true };
  });

  // ───────────── Observaciones de campo (siempre provenance = observed) ─────────────

  app.post<{ Params: { id: string } }>('/api/parcels/:id/observations', async (req) => {
    const s = await requireUser(req);
    const pid = uuidParam(req.params.id);
    await requireParcelOwner(s.sub, pid);
    const body = parse(ObservationBody, req.body);
    const photo = body.photo ? Buffer.from(body.photo.split(',')[1]!, 'base64') : null;
    const [row] = await sql<{ id: string }[]>`
      insert into observations (parcel_id, user_id, type, value, photo, lat, lon, accuracy_m, observed_at)
      values (${pid}, ${s.sub}, ${body.value.type}, ${sql.json(body.value)}, ${photo},
              ${body.lat}, ${body.lon}, ${body.accuracyM}, ${body.observedAt})
      returning id`;
    return { id: row!.id };
  });

  app.get<{ Params: { id: string } }>('/api/parcels/:id/observations', async (req): Promise<Observation[]> => {
    const s = await requireUser(req);
    const pid = uuidParam(req.params.id);
    await requireParcelOwner(s.sub, pid);
    const rows = await sql<{ id: string; value: Observation['value']; observed_at: Date; has_photo: boolean }[]>`
      select id, value, observed_at, photo is not null as has_photo
      from observations where parcel_id = ${pid} order by observed_at desc`;
    return rows.map((r) => ({
      id: r.id,
      parcelId: pid,
      value: r.value,
      observedAt: r.observed_at.toISOString(),
      hasPhoto: r.has_photo,
      provenance: 'observed' as const,
    }));
  });

  app.get<{ Params: { id: string } }>('/api/observations/:id/photo', async (req, reply) => {
    const s = await requireUser(req);
    const oid = uuidParam(req.params.id);
    const [row] = await sql<{ photo: Buffer | null }[]>`
      select o.photo from observations o join parcels p on p.id = o.parcel_id
      where o.id = ${oid} and p.owner_id = ${s.sub}`;
    if (!row?.photo) throw new HttpError(404, 'Foto no encontrada');
    return reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=86400').send(row.photo);
  });

  app.delete<{ Params: { id: string } }>('/api/observations/:id', async (req) => {
    const s = await requireUser(req);
    const oid = uuidParam(req.params.id);
    const res = await sql`
      delete from observations o using parcels p
      where o.id = ${oid} and p.id = o.parcel_id and p.owner_id = ${s.sub}`;
    if (res.count === 0) throw new HttpError(404, 'Observación no encontrada');
    return { ok: true };
  });
}
