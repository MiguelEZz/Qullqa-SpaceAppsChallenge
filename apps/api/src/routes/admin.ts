import type { FastifyInstance } from 'fastify';
import type { RunResult } from '@qullqa/engine';
import { sql } from '../db.ts';
import { HttpError, requireAdmin, uuidParam } from '../http.ts';
import { privateView } from '@qullqa/engine';
import { seedDemoCommunity } from '../demo/seed.ts';
import { enqueueRun } from './runs.ts';
import { startSession } from './auth.ts';

/**
 * Panel de administración: estadísticas para tomar decisiones. Muestra agregados y datos por parcela de forma
 * ANÓNIMA («Familia 3»): nunca teléfonos ni las monedas de una persona (solo promedios con ≥ 3 familias).
 * Los datos demo (sintéticos) se excluyen de los totales reales y se marcan siempre.
 */
const MIN_GROUP = 3;

/** Embudo de uso: en qué paso se queda la gente. `cid` limita a una comunidad. */
async function funnel(cid: string | null) {
  const inC = (col: string) => (cid ? sql`and ${sql(col)} = ${cid}` : sql``);
  const [f] = await sql<Record<string, number>[]>`
    select
      (select count(*)::int from users u where (not u.is_demo or ${!!cid}) ${cid ? sql`and exists(select 1 from memberships m where m.user_id = u.id and m.community_id = ${cid})` : sql``}) as registered,
      (select count(distinct m.user_id)::int from memberships m join users u on u.id = m.user_id where (not u.is_demo or ${!!cid}) ${inC('m.community_id')}) as joined,
      (select count(distinct p.owner_id)::int from parcels p join users u on u.id = p.owner_id where (not u.is_demo or ${!!cid}) ${inC('p.community_id')}) as parcel,
      (select count(distinct pr.user_id)::int from preferences pr join users u on u.id = pr.user_id where (not u.is_demo or ${!!cid}) ${inC('pr.community_id')}) as priorities,
      (select count(distinct m.user_id)::int from memberships m join users u on u.id = m.user_id where m.submitted_at is not null and (not u.is_demo or ${!!cid}) ${inC('m.community_id')}) as submitted,
      (select count(distinct m.user_id)::int from memberships m join users u on u.id = m.user_id where m.plan_viewed_at is not null and (not u.is_demo or ${!!cid}) ${inC('m.community_id')}) as viewed`;
  return f!;
}

/** Confianza de los planes y qué dato falta más seguido (de la última corrida de cada comunidad). */
function confidenceSummary(results: RunResult[]) {
  const levels = { alta: 0, media: 0, baja: 0 } as Record<string, number>;
  const missing = new Map<string, number>();
  let n = 0;
  for (const r of results) for (const p of r.participants ?? []) {
    const c = p.strategies.community.confidence;
    levels[c.level] = (levels[c.level] ?? 0) + 1;
    n++;
    // Agrupa textos con números distintos («Solo 58 % de…» y «Solo 61 % de…»)
    for (const m of new Set(c.missing.map((x) => x.replace(/\d+([.,]\d+)?/g, '#')))) missing.set(m, (missing.get(m) ?? 0) + 1);
  }
  return { families: n, levels, missing: [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, count]) => ({ text, count })) };
}

const csvCell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCsv = (rows: Record<string, unknown>[]) =>
  rows.length ? [Object.keys(rows[0]!).join(','), ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') + '\n' : '';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (req) => {
    await requireAdmin(req);
    const [t] = await sql<Record<string, number>[]>`
      select
        (select count(*)::int from users where not is_demo) as users,
        (select count(*)::int from users where not is_demo and created_at > now() - interval '7 days') as users7,
        (select count(distinct m.community_id)::int from memberships m join users u on u.id = m.user_id where not u.is_demo) as communities,
        (select count(*)::int from memberships m join users u on u.id = m.user_id where not u.is_demo and m.submitted_at is not null) as submitted,
        (select count(*)::int from parcels p join users u on u.id = p.owner_id where not u.is_demo) as parcels,
        (select coalesce(sum(ST_Area(p.polygon)) / 10000, 0)::float from parcels p join users u on u.id = p.owner_id where not u.is_demo) as hectares,
        (select count(*)::int from observations o join users u on u.id = o.user_id where not u.is_demo) as observations,
        (select count(*)::int from runs r join communities c on c.id = r.community_id where not c.is_demo) as runs,
        (select count(*)::int from runs r join communities c on c.id = r.community_id where not c.is_demo and r.status = 'failed') as runs_failed,
        (select coalesce(avg(duration_ms), 0)::float from runs where status = 'done') as run_avg_ms`;
    const signups = await sql<{ day: string; n: number }[]>`
      select to_char(d, 'YYYY-MM-DD') as day, (select count(*)::int from users u where not u.is_demo and u.created_at::date = d::date) as n
      from generate_series(current_date - 29, current_date, interval '1 day') d order by d`;
    const obsByType = await sql<{ type: string; n: number }[]>`
      select o.type, count(*)::int as n from observations o join users u on u.id = o.user_id where not u.is_demo group by o.type order by n desc`;
    const cropArea = await sql<{ crop: string; ha: number; parcels: number }[]>`
      select p.current_rotation[3] as crop, (sum(ST_Area(p.polygon)) / 10000)::float as ha, count(*)::int as parcels
      from parcels p join users u on u.id = p.owner_id where not u.is_demo group by 1 order by ha desc`;
    const communities = await sql<{
      id: string; name: string; province: string | null; is_demo: boolean; has_valley: boolean; members: number; submitted: number;
      parcels: number; hectares: number; observations: number; frosts: number; last_run: Date | null; last_status: string | null;
    }[]>`
      select c.id, c.name, c.province, c.is_demo, c.valley_id is not null as has_valley,
        (select count(*)::int from memberships m where m.community_id = c.id) as members,
        (select count(*)::int from memberships m where m.community_id = c.id and m.submitted_at is not null) as submitted,
        (select count(*)::int from parcels p where p.community_id = c.id) as parcels,
        (select coalesce(sum(ST_Area(p.polygon)) / 10000, 0)::float from parcels p where p.community_id = c.id) as hectares,
        (select count(*)::int from observations o join parcels p on p.id = o.parcel_id where p.community_id = c.id) as observations,
        (select count(*)::int from observations o join parcels p on p.id = o.parcel_id where p.community_id = c.id and o.type = 'frost') as frosts,
        (select max(r.finished_at) from runs r where r.community_id = c.id and r.status = 'done') as last_run,
        (select r.status from runs r where r.community_id = c.id order by r.created_at desc limit 1) as last_status
      from communities c
      where exists(select 1 from memberships m where m.community_id = c.id)
      order by c.is_demo, members desc, c.name`;
    const [act] = await sql<{ active7: number; active30: number }[]>`
      select count(*) filter (where last_seen_at > now() - interval '7 days')::int as active7,
             count(*) filter (where last_seen_at > now() - interval '30 days')::int as active30
      from users where not is_demo`;
    const obsByWeek = await sql<{ week: string; n: number }[]>`
      select to_char(w, 'DD/MM') as week,
        (select count(*)::int from observations o join users u on u.id = o.user_id
         where not u.is_demo and o.created_at >= w and o.created_at < w + interval '7 days') as n
      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w order by w`;
    const latest = await sql<{ result: RunResult }[]>`
      select distinct on (r.community_id) r.result from runs r join communities c on c.id = r.community_id
      where r.status = 'done' and not c.is_demo order by r.community_id, r.created_at desc`;
    return {
      totals: { ...t, ...act }, signups, obsByType, cropArea, communities, obsByWeek,
      funnel: await funnel(null), confidence: confidenceSummary(latest.map((x) => x.result)),
    };
  });

  app.get<{ Params: { id: string } }>('/api/admin/communities/:id', async (req) => {
    await requireAdmin(req);
    const id = uuidParam(req.params.id);
    const [c] = await sql<{ id: string; name: string; district: string | null; province: string | null; is_demo: boolean; valley_id: string | null; lon: number; lat: number; altitude_m: number | null }[]>`
      select id, name, district, province, is_demo, valley_id, ST_X(center::geometry) as lon, ST_Y(center::geometry) as lat, altitude_m
      from communities where id = ${id}`;
    if (!c) throw new HttpError(404, 'Comunidad no encontrada');

    // Familias anónimas y estables (orden de llegada)
    const members = await sql<{ user_id: string; name: string; submitted_at: Date | null }[]>`
      select m.user_id, u.name, m.submitted_at from memberships m join users u on u.id = m.user_id
      where m.community_id = ${id} order by m.joined_at, m.user_id`;
    const fam = new Map(members.map((m, i) => [m.user_id, i + 1]));

    const parcels = await sql<{ id: string; owner_id: string; geo: { coordinates: [number, number][][] }; area_ha: number; alt: number | null; irrigation: { source: string; turnsPerMonth: number; hoursPerTurn: number }; rot: string[] }[]>`
      select id, owner_id, ST_AsGeoJSON(polygon)::json as geo, (ST_Area(polygon) / 10000)::float as area_ha, gps_altitude_m as alt, irrigation, current_rotation as rot
      from parcels where community_id = ${id} order by created_at`;

    const prefs = await sql<{ focus: string[]; coins: Record<string, number>; constraints: { traction: string; market: string; livestockHeads: number; familyWorkers: number } }[]>`
      select focus, coins, constraints from preferences where community_id = ${id}`;
    const avgCoins = prefs.length >= MIN_GROUP
      ? Object.fromEntries(Object.keys(prefs[0]!.coins).map((k) => [k, prefs.reduce((s, p) => s + (p.coins[k] ?? 0), 0) / prefs.length]))
      : null;
    const count = (xs: string[]) => xs.reduce<Record<string, number>>((o, x) => ((o[x] = (o[x] ?? 0) + 1), o), {});

    const obs = await sql<{ parcel_id: string; type: string; value: Record<string, unknown>; observed_at: Date }[]>`
      select o.parcel_id, o.type, o.value, o.observed_at from observations o join parcels p on p.id = o.parcel_id
      where p.community_id = ${id} order by o.observed_at`;
    const parcelById = new Map(parcels.map((p) => [p.id, p]));

    const [run] = await sql<{ id: string; finished_at: Date; duration_ms: number; result: RunResult }[]>`
      select id, finished_at, duration_ms, result from runs where community_id = ${id} and status = 'done' order by created_at desc limit 1`;
    const r = run?.result?.participants ? run.result : undefined; // ignora resultados incompletos

    // Riesgo por parcela con lo que siembran hoy y con el plan comunitario (simulado)
    const risk = r ? r.participants.flatMap((p) => p.strategies.current.parcels.map((cur) => {
      const plan = p.strategies.community.parcels.find((x) => x.parcelId === cur.parcelId);
      const pick = (v: typeof cur) => ({ lossProb: v.indicators.climateRisk.mean, deficitMm: v.indicators.water.mean, erosionTha: v.indicators.erosion.mean, incomeHa: v.indicators.income.mean, pest: v.indicators.pestHealth.mean });
      return { parcelId: cur.parcelId, family: fam.get(p.userId) ?? 0, current: pick(cur), plan: plan ? pick(plan) : null };
    })) : [];

    // Historia de la comunidad: cada cálculo guarda una copia fija de los datos de ese momento
    const runsHist = await sql<{ id: string; kind: string; finished_at: Date; input: { participants: { parcels: { id: string; areaHa: number; currentRotation: string[] }[] }[] }; plan: { parcelId: string; rotation: string[] }[] | null }[]>`
      select id, kind, finished_at, input, result->'community'->'plan' as plan from runs
      where community_id = ${id} and status = 'done' order by created_at desc limit 30`;
    const history = runsHist.map((h) => {
      const ps = h.input.participants.flatMap((p) => p.parcels);
      const area = new Map(ps.map((p) => [p.id, p.areaHa]));
      const sum = (pairs: [string, number][]) => pairs.reduce<Record<string, number>>((o, [k, v]) => ((o[k] = (o[k] ?? 0) + v), o), {});
      return {
        id: h.id, kind: h.kind, date: h.finished_at.toISOString(), families: h.input.participants.length, parcels: ps.length,
        hectares: Math.round(ps.reduce((x, p) => x + p.areaHa, 0) * 100) / 100,
        nowByCrop: sum(ps.map((p) => [p.currentRotation[2]!, p.areaHa])),
        planByCrop: sum((h.plan ?? []).map((p) => [p.rotation[0]!, area.get(p.parcelId) ?? 0])),
      };
    });

    return {
      history,
      funnel: await funnel(id),
      risk,
      confidence: r ? confidenceSummary([r]) : null,
      community: { id: c.id, name: c.name, district: c.district, province: c.province, isDemo: c.is_demo, hasValleyData: !!c.valley_id, center: [c.lon, c.lat], altitudeM: c.altitude_m },
      members: members.length,
      submitted: members.filter((m) => m.submitted_at).length,
      // Solo para comunidades demo: lista para «ver como» (las reales nunca exponen nombres aquí)
      demoMembers: c.is_demo ? members.map((m) => ({ userId: m.user_id, name: m.name, family: fam.get(m.user_id)! })) : [],
      parcels: parcels.map((p) => ({
        id: p.id, family: fam.get(p.owner_id) ?? 0, ring: (p.geo.coordinates[0] ?? []).slice(0, -1), areaHa: Math.round(p.area_ha * 1000) / 1000,
        altitudeM: p.alt, irrigation: p.irrigation.source, rotation: p.rot,
      })),
      priorities: {
        n: prefs.length, avgCoins, minGroup: MIN_GROUP,
        // «¿Qué te importa más?»: cuántas familias eligieron cada tarjeta (solo con ≥ 3 familias)
        focusCounts: prefs.length >= MIN_GROUP ? count(prefs.flatMap((p) => p.focus)) : null,
      },
      resources: prefs.length >= MIN_GROUP ? {
        traction: count(prefs.map((p) => p.constraints.traction)),
        market: count(prefs.map((p) => p.constraints.market)),
        livestock: prefs.reduce((s, p) => s + (p.constraints.livestockHeads ?? 0), 0),
        workers: prefs.reduce((s, p) => s + (p.constraints.familyWorkers ?? 0), 0),
      } : null,
      observations: {
        byType: count(obs.map((o) => o.type)),
        frosts: obs.filter((o) => o.type === 'frost').map((o) => ({ date: o.observed_at.toISOString(), severity: o.value.severity, minTempC: o.value.minTempC, crop: o.value.damagedCrop, altitudeM: parcelById.get(o.parcel_id)?.alt ?? null })),
        harvests: obs.filter((o) => o.type === 'harvest').map((o) => ({ date: String(o.value.harvestDate), crop: String(o.value.crop), kgHa: Math.round(Number(o.value.kg) / (Number(o.value.areaM2) / 10_000)), altitudeM: parcelById.get(o.parcel_id)?.alt ?? null })),
        soilMoisture: count(obs.filter((o) => o.type === 'soil_moisture').map((o) => String(o.value.fistTest))),
        erosion: count(obs.filter((o) => o.type === 'erosion').map((o) => String(o.value.level))),
        byMonth: count(obs.map((o) => o.observed_at.toISOString().slice(0, 7))),
      },
      run: r && run ? {
        id: run.id, finishedAt: run.finished_at.toISOString(), durationMs: run.duration_ms, participants: r.participants.length,
        feasible: r.community.feasible, surplus: r.community.surplus_soles, shapleyMethod: r.community.shapleyMethod,
        metrics: r.community.metrics, mutualBenefit: r.community.mutualBenefit, cooperationCurve: r.community.cooperationCurve,
        plan: r.community.plan.map((p) => ({ parcelId: p.parcelId, family: fam.get(p.ownerId) ?? 0, rotation: p.rotation, rotationText: p.rotationText })),
        families: r.participants.map((p) => ({
          family: fam.get(p.userId) ?? 0, utilityCurrent: p.strategies.current.utility, utilitySolo: p.utilitySolo, utilityCommunity: p.utilityCommunity,
          rationalityOk: p.rationalityOk, transfer: p.shapley.transfer, ayni: p.shapley.ayni, confidence: p.strategies.community.confidence.level,
        })).sort((a, b) => a.family - b.family),
        diagnosis: r.diagnosis,
        dataCoverage: r.dataCoverage,
        warnings: r.warnings,
      } : null,
    };
  });

  /** Crea (o regenera) la comunidad demo y lanza su cálculo. */
  app.post('/api/admin/demo', async (req) => {
    const s = await requireAdmin(req);
    const id = await seedDemoCommunity();
    await enqueueRun(id, s.sub);
    return { id };
  });

  /** Recalcular el plan de cualquier comunidad. */
  app.post<{ Params: { id: string } }>('/api/admin/communities/:id/run', async (req) => {
    const s = await requireAdmin(req);
    const run = await enqueueRun(uuidParam(req.params.id), s.sub);
    if (!run) throw new HttpError(409, 'No hay datos enviados o la zona no tiene datos del valle');
    return run;
  });

  /** Lo que ve en su celular una familia DEMO (mismo filtro de privacidad que su app). */
  app.get<{ Params: { id: string; userId: string } }>('/api/admin/communities/:id/view/:userId', async (req) => {
    await requireAdmin(req);
    const id = uuidParam(req.params.id), userId = uuidParam(req.params.userId);
    const [u] = await sql<{ is_demo: boolean; name: string }[]>`select is_demo, name from users where id = ${userId}`;
    if (!u?.is_demo) throw new HttpError(403, 'Solo se puede ver la pantalla de una familia demo');
    const [run] = await sql<{ id: string; created_at: Date; finished_at: Date; duration_ms: number; result: RunResult }[]>`
      select id, created_at, finished_at, duration_ms, result from runs where community_id = ${id} and status = 'done' order by created_at desc limit 1`;
    return {
      name: u.name,
      latest: run ? { id: run.id, createdAt: run.created_at.toISOString(), finishedAt: run.finished_at.toISOString(), durationMs: run.duration_ms, view: privateView(run.result, userId) } : null,
    };
  });

  /**
   * Descarga en CSV (anónima: «familia» es un número dentro de su comunidad; nunca nombres ni teléfonos).
   * /api/admin/export/parcels.csv | observations.csv | communities.csv  [?community=<id>]
   */
  app.get<{ Params: { kind: string }; Querystring: { community?: string } }>('/api/admin/export/:kind', async (req, reply) => {
    await requireAdmin(req);
    const cid = req.query.community ? uuidParam(req.query.community) : null;
    const only = (col: string) => (cid ? sql`and ${sql(col)} = ${cid}` : sql``);
    const famCte = sql`fam as (select user_id, community_id, row_number() over (partition by community_id order by joined_at, user_id)::int as family from memberships)`;
    let rows: Record<string, unknown>[];
    switch (req.params.kind) {
      case 'parcels.csv':
        rows = await sql`
          with ${famCte}
          select c.name as comunidad, c.is_demo as demo, f.family as familia, p.id as parcela_id,
            round((ST_Area(p.polygon) / 10000)::numeric, 4) as hectareas, p.gps_altitude_m as altitud_gps_m,
            round(ST_Y(ST_Centroid(p.polygon::geometry))::numeric, 5) as lat, round(ST_X(ST_Centroid(p.polygon::geometry))::numeric, 5) as lon,
            p.capture_method as captura, p.irrigation->>'source' as riego, p.irrigation->>'turnsPerMonth' as turnos_mes, p.irrigation->>'hoursPerTurn' as horas_turno,
            p.current_rotation[1] as hace_2_campanas, p.current_rotation[2] as campana_pasada, p.current_rotation[3] as campana_actual,
            p.created_at as creada
          from parcels p join communities c on c.id = p.community_id left join fam f on f.user_id = p.owner_id and f.community_id = p.community_id
          where true ${only('p.community_id')} order by c.name, f.family`;
        break;
      case 'observations.csv':
        rows = await sql`
          with ${famCte}
          select c.name as comunidad, c.is_demo as demo, f.family as familia, o.parcel_id as parcela_id, o.type as tipo,
            o.observed_at as fecha, o.value as valor, o.lat, o.lon, o.accuracy_m as precision_m, (o.photo is not null) as tiene_foto
          from observations o join parcels p on p.id = o.parcel_id join communities c on c.id = p.community_id
          left join fam f on f.user_id = o.user_id and f.community_id = p.community_id
          where true ${only('p.community_id')} order by c.name, o.observed_at`;
        break;
      case 'communities.csv':
        rows = await sql`
          select c.name as comunidad, c.district as distrito, c.province as provincia, c.is_demo as demo, c.valley_id is not null as datos_valle,
            (select count(*) from memberships m where m.community_id = c.id) as familias,
            (select count(*) from memberships m where m.community_id = c.id and m.submitted_at is not null) as enviaron,
            (select count(*) from parcels p where p.community_id = c.id) as parcelas,
            (select round(coalesce(sum(ST_Area(p.polygon)), 0)::numeric / 10000, 3) from parcels p where p.community_id = c.id) as hectareas,
            (select count(*) from observations o join parcels p on p.id = o.parcel_id where p.community_id = c.id) as observaciones,
            (select max(r.finished_at) from runs r where r.community_id = c.id and r.status = 'done') as ultimo_plan
          from communities c where exists(select 1 from memberships m where m.community_id = c.id) ${only('c.id')} order by c.name`;
        break;
      default:
        throw new HttpError(404, 'No encontrado');
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="qullqa-${req.params.kind.replace('.csv', '')}-${stamp}.csv"`)
      .send('\uFEFF' + toCsv(rows)); // BOM: Excel abre bien las tildes
  });

  /** «Ver como» una familia DEMO (nunca una persona real), para ver su app en el celular. */
  app.post<{ Params: { userId: string } }>('/api/admin/act-as/:userId', async (req, reply) => {
    const s = await requireAdmin(req);
    const [u] = await sql<{ id: string; name: string; is_demo: boolean }[]>`select id, name, is_demo from users where id = ${uuidParam(req.params.userId)}`;
    if (!u?.is_demo) throw new HttpError(403, 'Solo se puede ver como una familia de la comunidad demo');
    await startSession(reply, u, s.sub);
    const [m] = await sql<{ community_id: string }[]>`select community_id from memberships where user_id = ${u.id} limit 1`;
    return { ok: true, communityId: m?.community_id ?? null };
  });
}
