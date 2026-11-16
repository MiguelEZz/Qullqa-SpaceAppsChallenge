import { EngineInput, type PreferencesBody } from '@qullqa/shared';
import { sql } from './db.ts';

/**
 * Arma el EngineInput (contrato carcasa → cerebro) leyendo la base de datos.
 * Incluye datos privados: solo lo usan el worker y el script de exportación, nunca una ruta HTTP pública.
 * Por defecto solo entran los agricultores que pulsaron «Enviar mis datos».
 */
export async function buildEngineInput(communityId: string, opts: { includeUnsubmitted?: boolean } = {}): Promise<EngineInput> {
  const [c] = await sql<{ id: string; name: string; lon: number; lat: number }[]>`
    select id, name, ST_X(center::geometry) as lon, ST_Y(center::geometry) as lat from communities where id = ${communityId}`;
  if (!c) throw new Error(`Comunidad ${communityId} no existe`);

  const members = await sql<{ user_id: string; submitted_at: Date | null }[]>`
    select user_id, submitted_at from memberships
    where community_id = ${communityId} ${opts.includeUnsubmitted ? sql`` : sql`and submitted_at is not null`}
    order by joined_at`;

  const prefs = await sql<{ user_id: string; coins: PreferencesBody['coins']; constraints: PreferencesBody['constraints']; vetoes: PreferencesBody['vetoes'] }[]>`
    select user_id, coins, constraints, vetoes from preferences where community_id = ${communityId}`;

  const parcels = await sql<{
    id: string; owner_id: string; name: string; geo: { type: 'Polygon'; coordinates: [number, number][][] };
    area_ha: number; cx: number; cy: number; gps_altitude_m: number | null;
    irrigation: { source: string; turnsPerMonth: number; hoursPerTurn: number }; current_rotation: string[];
    neighbor_ids: string[];
  }[]>`
    select p.id, p.owner_id, p.name, ST_AsGeoJSON(p.polygon)::json as geo, ST_Area(p.polygon) / 10000 as area_ha,
           ST_X(ST_Centroid(p.polygon::geometry)) as cx, ST_Y(ST_Centroid(p.polygon::geometry)) as cy,
           p.gps_altitude_m, p.irrigation, p.current_rotation,
           coalesce((select array_agg(q.id order by q.id) from parcels q
                     where q.community_id = p.community_id and q.id <> p.id and ST_DWithin(p.polygon, q.polygon, 50)), '{}') as neighbor_ids
    from parcels p where p.community_id = ${communityId} order by p.created_at`;

  const obs = await sql<{ id: string; parcel_id: string; value: unknown; observed_at: Date; lat: number | null; lon: number | null }[]>`
    select o.id, o.parcel_id, o.value, o.observed_at, o.lat, o.lon
    from observations o join parcels p on p.id = o.parcel_id
    where p.community_id = ${communityId} order by o.observed_at`;

  const input = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    community: { id: c.id, name: c.name, center: [c.lon, c.lat] as [number, number] },
    participants: members.map((m) => {
      const p = prefs.find((x) => x.user_id === m.user_id);
      return {
        userId: m.user_id,
        submittedAt: m.submitted_at?.toISOString() ?? null,
        preferences: p ? { coins: p.coins, constraints: p.constraints, vetoes: p.vetoes } : null,
        parcels: parcels
          .filter((x) => x.owner_id === m.user_id)
          .map((x) => ({
            id: x.id,
            name: x.name,
            polygon: x.geo,
            areaHa: x.area_ha,
            centroid: [x.cx, x.cy] as [number, number],
            gpsAltitudeM: x.gps_altitude_m,
            irrigation: x.irrigation,
            currentRotation: x.current_rotation as [string, string, string],
            neighborIds: x.neighbor_ids,
            observations: obs
              .filter((o) => o.parcel_id === x.id)
              .map((o) => ({
                id: o.id,
                value: o.value,
                observedAt: o.observed_at.toISOString(),
                lat: o.lat,
                lon: o.lon,
                provenance: 'observed' as const,
              })),
          })),
      };
    }),
  };
  // Valida el contrato: si la carcasa produce algo que el cerebro no entiende, falla aquí y no en el motor.
  return EngineInput.parse(input);
}
