/**
 * Privacidad: cada agricultor solo ve SU información; la vista comunitaria solo trae agregados.
 * Corre contra la base real (docker) con usuarios de prueba que se borran al final.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { json, migrate, sql } from '../src/db.ts';
import { buildEngineInput } from '../src/engineInput.ts';
import { schedulePersonalPlans } from '../src/routes/runs.ts';

let app: FastifyInstance;
const phones: string[] = [];
let communityId = '';
const slug = `test-${Date.now()}`;
const extraCommunities: string[] = [];

// Dos parcelas vecinas en el corredor Chivay–Yanque (≈ 30 m × 30 m cada una)
const ringA: [number, number][] = [[-71.6352, -15.6402], [-71.6349, -15.6402], [-71.6349, -15.6399], [-71.6352, -15.6399]];
const ringB: [number, number][] = [[-71.6348, -15.6402], [-71.6345, -15.6402], [-71.6345, -15.6399], [-71.6348, -15.6399]];

const coins = { water: 2, climateRisk: 2, organicMatter: 1, nitrogen: 1, erosion: 1, pestHealth: 1, income: 1, forage: 1 };
const constraints = { traction: 'yunta', familyWorkers: 3, canGetExtraLabor: true, market: 'mixto', livestockHeads: 4 };
const irrigation = { source: 'canal', turnsPerMonth: 2, hoursPerTurn: 3 };

async function register(name: string) {
  const phone = `9${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  phones.push(phone);
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name, phone, pin: '1234', acceptTerms: true } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'qullqa_session')!;
  return { id: res.json().id as string, phone, recoveryCode: res.json().recoveryCode as string, headers: { cookie: `qullqa_session=${cookie.value}` } };
}

let alice: Awaited<ReturnType<typeof register>>;
let bruno: Awaited<ReturnType<typeof register>>;
let carla: Awaited<ReturnType<typeof register>>; // no pertenece a la comunidad
let parcelA = '';
let obsA = '';

beforeAll(async () => {
  await migrate();
  app = await buildApp({ logger: false });
  alice = await register('Test Alice');
  bruno = await register('Test Bruno');
  carla = await register('Test Carla');

  // Comunidad de prueba del catálogo (las reales se siembran con seedCommunities)
  const [c] = await sql<{ id: string }[]>`
    insert into communities (slug, name, district, province, region, listed, valley_id, center)
    values (${slug}, 'Test Yanque', 'Yanque', 'Caylloma', 'Arequipa', true, 'colca-chivay-yanque-coporaque', ST_SetSRID(ST_MakePoint(-71.635, -15.64), 4326)::geography)
    returning id`;
  communityId = c!.id;
  for (const u of [alice, bruno]) {
    const j = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/join`, headers: u.headers });
    expect(j.statusCode).toBe(200);
  }

  const base = { communityId, captureMethod: 'draw', irrigation, currentRotation: ['papa', 'haba', 'cebada'] };
  const pa = await app.inject({ method: 'POST', url: '/api/parcels', headers: alice.headers, payload: { ...base, name: 'Chacra de Alice', ring: ringA } });
  expect(pa.statusCode).toBe(200);
  parcelA = pa.json().id;
  const pb = await app.inject({ method: 'POST', url: '/api/parcels', headers: bruno.headers, payload: { ...base, name: 'Chacra de Bruno', ring: ringB } });
  expect(pb.statusCode).toBe(200);

  for (const u of [alice, bruno]) {
    const r = await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: u.headers, payload: { coins, constraints, vetoes: ['tarwi'] } });
    expect(r.statusCode).toBe(200);
  }
  const o = await app.inject({
    method: 'POST', url: `/api/parcels/${parcelA}/observations`, headers: alice.headers,
    payload: { value: { type: 'soil_moisture', fistTest: 'seco' }, lat: -15.64, lon: -71.635, accuracyM: 5, observedAt: new Date().toISOString(), photo: null },
  });
  expect(o.statusCode).toBe(200);
  obsA = o.json().id;
});

afterAll(async () => {
  if (communityId) await sql`delete from communities where id = ${communityId}`;
  if (extraCommunities.length) await sql`delete from communities where id in ${sql(extraCommunities)}`;
  await sql`delete from users where phone in ${sql(phones)}`;
  await app?.close();
  await sql.end();
});

describe('privacidad entre agricultores', () => {
  it('la vista comunitaria no contiene preferencias, nombres de parcela, observaciones ni teléfonos', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/communities/${communityId}`, headers: bruno.headers });
    expect(r.statusCode).toBe(200);
    const text = r.body;
    expect(r.json().parcels).toHaveLength(2);
    for (const leak of ['coins', 'constraints', 'vetoes', 'tarwi', 'Chacra de Alice', 'soil_moisture', 'Test Alice', ...phones]) {
      expect(text).not.toContain(leak);
    }
    const mine = r.json().parcels.filter((p: { mine: boolean }) => p.mine);
    expect(mine).toHaveLength(1);
  });

  it('nadie puede leer, editar ni borrar la parcela de otro (404, sin revelar que existe)', async () => {
    for (const [method, url] of [
      ['GET', `/api/parcels/${parcelA}`],
      ['PATCH', `/api/parcels/${parcelA}`],
      ['DELETE', `/api/parcels/${parcelA}`],
      ['GET', `/api/parcels/${parcelA}/observations`],
      ['POST', `/api/parcels/${parcelA}/observations`],
      ['GET', `/api/observations/${obsA}/photo`],
      ['DELETE', `/api/observations/${obsA}`],
    ] as const) {
      const r = await app.inject({ method, url, headers: bruno.headers, payload: method === 'PATCH' ? { name: 'x' } : method === 'POST' ? {} : undefined });
      expect([400, 404], `${method} ${url}`).toContain(r.statusCode);
      expect(r.body).not.toContain('Chacra de Alice');
    }
  });

  it('las preferencias que devuelve la API son solo las propias', async () => {
    await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers, payload: { coins: { ...coins, income: 3, forage: 0, organicMatter: 0 }, constraints, vetoes: [] } });
    const a = await app.inject({ method: 'GET', url: `/api/communities/${communityId}/preferences`, headers: alice.headers });
    expect(a.json().vetoes).toEqual(['tarwi']);
    expect(a.json().coins.income).toBe(1);
  });

  it('un no-miembro no ve nada de la comunidad', async () => {
    for (const url of [`/api/communities/${communityId}`, `/api/communities/${communityId}/preferences`, `/api/communities/${communityId}/my-parcels`, `/api/communities/${communityId}/readiness`]) {
      const r = await app.inject({ method: 'GET', url, headers: carla.headers });
      expect(r.statusCode, url).toBe(403);
    }
  });

  it('sin sesión todo responde 401', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/communities/${communityId}` });
    expect(r.statusCode).toBe(401);
  });
});

describe('comunidades del catálogo', () => {
  it('se buscan sin sesión, sin tildes, y no exponen a sus miembros', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/communities?q=${encodeURIComponent('test yanque')}` });
    expect(r.statusCode).toBe(200);
    const hit = r.json().find((c: { slug: string }) => c.slug === slug);
    expect(hit.memberCount).toBe(2);
    expect(hit.isMember).toBe(false);
    for (const leak of ['Test Alice', 'Test Bruno', ...phones]) expect(r.body).not.toContain(leak);
    const mine = await app.inject({ method: 'GET', url: `/api/communities/by-slug/${slug}`, headers: alice.headers });
    expect(mine.json().isMember).toBe(true);
  });

  it('ya no se pueden crear comunidades', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/communities', headers: carla.headers, payload: { name: 'Mi comunidad' } });
    expect(r.statusCode).toBe(404);
  });

  it('salir de la comunidad borra mis parcelas y prioridades ahí', async () => {
    const j = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/join`, headers: carla.headers });
    expect(j.statusCode).toBe(200);
    await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: carla.headers, payload: { coins, constraints, vetoes: [] } });
    const l = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/leave`, headers: carla.headers });
    expect(l.statusCode).toBe(200);
    const [p] = await sql<{ n: number }[]>`select count(*)::int as n from preferences where user_id = ${carla.id}`;
    expect(p!.n).toBe(0);
    const v = await app.inject({ method: 'GET', url: `/api/communities/${communityId}`, headers: carla.headers });
    expect(v.statusCode).toBe(403);
  });
});

describe('datos listos para el cerebro', () => {
  it('enviar marca al agricultor y el EngineInput solo trae a quienes enviaron', async () => {
    const s = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/submit`, headers: alice.headers });
    expect(s.statusCode).toBe(200);
    expect(s.json().submittedAt).not.toBeNull();

    const input = await buildEngineInput(communityId);
    expect(input.participants).toHaveLength(1);
    const p = input.participants[0]!;
    expect(p.preferences?.vetoes).toEqual(['tarwi']);
    expect(p.parcels[0]!.observations[0]!.provenance).toBe('observed');
    expect(p.parcels[0]!.areaHa).toBeGreaterThan(0.05);
    // B está a ~10 m de A → vecinos
    const all = await buildEngineInput(communityId, { includeUnsubmitted: true });
    expect(all.participants).toHaveLength(2);
    expect(all.participants[0]!.parcels[0]!.neighborIds).toHaveLength(1);
  });

  it('si solo él envió, espera a sus vecinos (sin cálculo) y sabe cuándo tendrá su plan personal', async () => {
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from runs where community_id = ${communityId}`;
    expect(n!.n).toBe(0);
    const plan = (await app.inject({ method: 'GET', url: `/api/communities/${communityId}/plan`, headers: alice.headers })).json();
    expect(plan.waiting).not.toBeNull();
    expect(Date.parse(plan.waiting.personalPlanAt) - Date.parse(plan.waiting.since)).toBe(72 * 3600_000);
  });

  it('cuando un vecino envía, se calcula el plan de la comunidad; la entrada es privada y solo la ven miembros', async () => {
    const s = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/submit`, headers: bruno.headers });
    expect(s.statusCode).toBe(200);
    const [run] = await sql<{ kind: string; input: { participants: unknown[] } }[]>`select kind, input from runs where community_id = ${communityId}`;
    expect(run!.kind).toBe('community');
    expect(run!.input.participants).toHaveLength(2);
    const plan = await app.inject({ method: 'GET', url: `/api/communities/${communityId}/plan`, headers: bruno.headers });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().pending?.status ?? plan.json().latest?.view.participantsCount).toBeTruthy();
    expect(plan.body).not.toContain('coins');
    const other = await app.inject({ method: 'GET', url: `/api/communities/${communityId}/plan`, headers: carla.headers });
    expect(other.statusCode).toBe(403);
    // Ya no existe el botón «calcular mi plan» para los agricultores
    const ask = await app.inject({ method: 'POST', url: `/api/communities/${communityId}/runs`, headers: bruno.headers });
    expect(ask.statusCode).toBe(404);
  });

  it('quien se suma a una comunidad con plan recibe el suyo y los vecinos conservan el de ellos', async () => {
    // Plan comunitario ya calculado (resultado mínimo: solo lo que usa el cálculo incremental)
    await sql`delete from runs where community_id = ${communityId}`;
    const plan = [
      { parcelId: parcelA, ownerId: alice.id, rotation: ['quinua', 'haba', 'papa'], rotationText: '' },
    ];
    await sql`insert into runs (community_id, valley_id, seed, input, status, kind, result, finished_at)
              values (${communityId}, 'colca-chivay-yanque-coporaque', 1, '{"participants":[]}', 'done', 'community', ${json({ community: { plan } })}, now())`;
    await app.inject({ method: 'POST', url: `/api/communities/${communityId}/join`, headers: carla.headers });
    const ringC: [number, number][] = [[-71.6344, -15.6402], [-71.6341, -15.6402], [-71.6341, -15.6399], [-71.6344, -15.6399]];
    const pc = await app.inject({ method: 'POST', url: '/api/parcels', headers: carla.headers, payload: { communityId, captureMethod: 'draw', irrigation, currentRotation: ['papa', 'haba', 'cebada'], name: 'Chacra de Carla', ring: ringC } });
    expect(pc.statusCode).toBe(200);
    await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: carla.headers, payload: { focus: ['money'], constraints, vetoes: [] } });
    await app.inject({ method: 'POST', url: `/api/communities/${communityId}/submit`, headers: carla.headers });
    const [inc] = await sql<{ kind: string; target_user: string; fixed_plans: Record<string, string[]> }[]>`
      select kind, target_user, fixed_plans from runs where community_id = ${communityId} and kind = 'incremental'`;
    expect(inc!.target_user).toBe(carla.id);
    expect(inc!.fixed_plans[parcelA]).toEqual(['quinua', 'haba', 'papa']);
    expect(Object.keys(inc!.fixed_plans)).not.toContain(pc.json().id);
  });

  it('a los 3 días sin vecinos, el agricultor solo recibe un plan personal', async () => {
    const dave = await register('Test Dave');
    const [c2] = await sql<{ id: string }[]>`
      insert into communities (slug, name, district, province, region, listed, valley_id, center)
      values (${slug + '-b'}, 'Test Coporaque', 'Coporaque', 'Caylloma', 'Arequipa', true, 'colca-chivay-yanque-coporaque', ST_SetSRID(ST_MakePoint(-71.635, -15.64), 4326)::geography)
      returning id`;
    extraCommunities.push(c2!.id);
    await app.inject({ method: 'POST', url: `/api/communities/${c2!.id}/join`, headers: dave.headers });
    await app.inject({ method: 'POST', url: '/api/parcels', headers: dave.headers, payload: { communityId: c2!.id, captureMethod: 'draw', irrigation, currentRotation: ['papa', 'haba', 'cebada'], name: 'Chacra de Dave', ring: ringA } });
    await app.inject({ method: 'PUT', url: `/api/communities/${c2!.id}/preferences`, headers: dave.headers, payload: { focus: ['safeHarvest'], constraints, vetoes: [] } });
    await app.inject({ method: 'POST', url: `/api/communities/${c2!.id}/submit`, headers: dave.headers });
    await schedulePersonalPlans();
    let [r] = await sql<{ n: number }[]>`select count(*)::int as n from runs where community_id = ${c2!.id}`;
    expect(r!.n).toBe(0); // todavía no pasaron 3 días
    await sql`update memberships set submitted_at = now() - interval '4 days' where user_id = ${dave.id}`;
    await schedulePersonalPlans();
    const [p] = await sql<{ kind: string; target_user: string; input: { participants: unknown[] } }[]>`select kind, target_user, input from runs where community_id = ${c2!.id}`;
    expect(p!.kind).toBe('personal');
    expect(p!.target_user).toBe(dave.id);
    expect(p!.input.participants).toHaveLength(1);
  });

  it('modo invitado: entra sin datos y genera su plan personal al momento; una cuenta normal no puede', async () => {
    const g = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: {} });
    expect(g.statusCode).toBe(200);
    const guestId = g.json().id as string;
    const headers = { cookie: `qullqa_session=${g.cookies.find((c) => c.name === 'qullqa_session')!.value}` };
    const [gu] = await sql<{ phone: string }[]>`select phone from users where id = ${guestId}`;
    phones.push(gu!.phone);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers })).json().isGuest).toBe(true);

    const [c3] = await sql<{ id: string }[]>`
      insert into communities (slug, name, district, province, region, listed, valley_id, center)
      values (${slug + '-g'}, 'Test Ichupampa', 'Ichupampa', 'Caylloma', 'Arequipa', true, 'colca-chivay-yanque-coporaque', ST_SetSRID(ST_MakePoint(-71.635, -15.64), 4326)::geography)
      returning id`;
    extraCommunities.push(c3!.id);
    await app.inject({ method: 'POST', url: `/api/communities/${c3!.id}/join`, headers });
    await app.inject({ method: 'POST', url: '/api/parcels', headers, payload: { communityId: c3!.id, captureMethod: 'draw', irrigation, currentRotation: ['papa', 'haba', 'cebada'], name: 'Chacra invitada', ring: ringA } });
    await app.inject({ method: 'PUT', url: `/api/communities/${c3!.id}/preferences`, headers, payload: { focus: ['money'], constraints, vetoes: [] } });
    expect((await app.inject({ method: 'POST', url: `/api/communities/${c3!.id}/plan/now`, headers })).statusCode).toBe(409); // sin enviar
    await app.inject({ method: 'POST', url: `/api/communities/${c3!.id}/submit`, headers });
    expect((await app.inject({ method: 'GET', url: `/api/communities/${c3!.id}/plan`, headers })).json().waiting).not.toBeNull();

    const now = await app.inject({ method: 'POST', url: `/api/communities/${c3!.id}/plan/now`, headers });
    expect(now.statusCode).toBe(200);
    const [run] = await sql<{ kind: string; target_user: string; input: { participants: unknown[] } }[]>`select kind, target_user, input from runs where community_id = ${c3!.id}`;
    expect(run!.kind).toBe('personal');
    expect(run!.target_user).toBe(guestId);
    expect(run!.input.participants).toHaveLength(1);
    // Pulsar dos veces no encola otra corrida
    expect((await app.inject({ method: 'POST', url: `/api/communities/${c3!.id}/plan/now`, headers })).json().id).toBe(now.json().id);
    expect((await app.inject({ method: 'POST', url: `/api/communities/${communityId}/plan/now`, headers: alice.headers })).statusCode).toBe(403);
  });

  it('editar la parcela obliga a reenviar', async () => {
    await app.inject({ method: 'PATCH', url: `/api/parcels/${parcelA}`, headers: alice.headers, payload: { name: 'Chacra de Alice 2' } });
    const r = await app.inject({ method: 'GET', url: `/api/communities/${communityId}/readiness`, headers: alice.headers });
    expect(r.json().submittedAt).toBeNull();
  });

  it('rechaza un contorno inválido o lejos del valle', async () => {
    const base = { communityId, captureMethod: 'draw', irrigation, currentRotation: ['papa', 'haba', 'cebada'], name: 'x' };
    const bowtie = [[-71.6352, -15.6402], [-71.6349, -15.6399], [-71.6349, -15.6402], [-71.6352, -15.6399]];
    const r1 = await app.inject({ method: 'POST', url: '/api/parcels', headers: alice.headers, payload: { ...base, ring: bowtie } });
    expect(r1.statusCode).toBe(400);
    const lima = [[-77.03, -12.04], [-77.029, -12.04], [-77.029, -12.039]];
    const r2 = await app.inject({ method: 'POST', url: '/api/parcels', headers: alice.headers, payload: { ...base, ring: lima } });
    expect(r2.statusCode).toBe(400);
  });
});

describe('«¿Qué te importa más?»', () => {
  it('las tarjetas se convierten en 10 monedas en el servidor; los animales suben el forraje', async () => {
    const put = await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers, payload: { focus: ['money'], constraints: { ...constraints, livestockHeads: 0 }, vetoes: [] } });
    expect(put.statusCode).toBe(200);
    const a = put.json();
    expect(a.coinsSource).toBe('cards');
    expect(Object.values(a.coins as Record<string, number>).reduce((x, y) => x + y, 0)).toBe(10);
    expect(a.coins.income).toBeGreaterThanOrEqual(4);
    const withAnimals = (await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers, payload: { focus: ['money'], constraints: { ...constraints, livestockHeads: 20 }, vetoes: [] } })).json();
    expect(withAnimals.coins.forage).toBeGreaterThan(a.coins.forage);
    const get = (await app.inject({ method: 'GET', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers })).json();
    expect(get.focus).toEqual(['money']);
    const none = await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers, payload: { constraints, vetoes: [] } });
    expect(none.statusCode).toBe(400);
    const three = await app.inject({ method: 'PUT', url: `/api/communities/${communityId}/preferences`, headers: bruno.headers, payload: { focus: ['money', 'animals', 'goodLand'], constraints, vetoes: [] } });
    expect(three.statusCode).toBe(400);
  });
});

describe('cuenta', () => {
  it('registrarse exige aceptar los términos', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Test Sin Términos', phone: '911111111', pin: '1234' } });
    expect(r.statusCode).toBe(400);
  });

  it('/me no expone el número completo', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/me', headers: alice.headers });
    expect(r.json().phoneHint).toBe(alice.phone.slice(-3));
    expect(r.body).not.toContain(alice.phone);
  });

  it('olvidé mi PIN: el código de recuperación sirve una sola vez y entrega otro', async () => {
    expect(carla.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/reset-pin', payload: { phone: carla.phone, recoveryCode: 'AAAA-AAAA', newPin: '4321' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/reset-pin', payload: { phone: carla.phone, recoveryCode: carla.recoveryCode.toLowerCase(), newPin: '4321' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().recoveryCode).not.toBe(carla.recoveryCode);
    const again = await app.inject({ method: 'POST', url: '/api/auth/reset-pin', payload: { phone: carla.phone, recoveryCode: carla.recoveryCode, newPin: '1111' } });
    expect(again.statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { phone: carla.phone, pin: '4321' } });
    expect(login.statusCode).toBe(200);
  });

  it('borrar la cuenta pide el PIN y elimina todo', async () => {
    const d = await register('Test Borrar');
    const wrong = await app.inject({ method: 'POST', url: '/api/me/delete', headers: d.headers, payload: { pin: '9999' } });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/me/delete', headers: d.headers, payload: { pin: '1234' } });
    expect(ok.statusCode).toBe(200);
    const [u] = await sql<{ n: number }[]>`select count(*)::int as n from users where id = ${d.id}`;
    expect(u!.n).toBe(0);
  });
});

describe('panel de administración', () => {
  it('quien no es administrador recibe 404 (no se revela que existe)', async () => {
    process.env.ADMIN_PHONES = '';
    const r = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: alice.headers });
    expect(r.statusCode).toBe(404);
  });

  it('el administrador ve agregados sin teléfonos; la demo no cuenta en los totales y solo se puede «ver como» familias demo', async () => {
    process.env.ADMIN_PHONES = `999999999,${alice.phone}`;
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: alice.headers });
    expect(me.json().isAdmin).toBe(true);

    const before = (await app.inject({ method: 'GET', url: '/api/admin/overview', headers: alice.headers })).json();
    const demo = await app.inject({ method: 'POST', url: '/api/admin/demo', headers: alice.headers });
    expect(demo.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: alice.headers });
    expect(after.json().totals.users).toBe(before.totals.users);
    expect(after.json().totals.parcels).toBe(before.totals.parcels);
    for (const p of phones) expect(after.body).not.toContain(p);

    const detail = await app.inject({ method: 'GET', url: `/api/admin/communities/${demo.json().id}`, headers: alice.headers });
    const d = detail.json();
    expect(d.parcels).toHaveLength(20);
    expect(d.demoMembers).toHaveLength(10);
    expect(d.priorities.avgCoins).not.toBeNull();
    expect(detail.body).not.toContain('demo-01'); // teléfono ficticio

    // La comunidad real de la prueba no lista nombres y no muestra promedios con menos de 3 familias
    const real = (await app.inject({ method: 'GET', url: `/api/admin/communities/${communityId}`, headers: alice.headers })).json();
    expect(real.demoMembers).toEqual([]);
    expect(real.priorities.avgCoins === null).toBe(real.priorities.n < 3);

    const nope = await app.inject({ method: 'POST', url: `/api/admin/act-as/${bruno.id}`, headers: alice.headers });
    expect(nope.statusCode).toBe(403);
    const act = await app.inject({ method: 'POST', url: `/api/admin/act-as/${d.demoMembers[0].userId}`, headers: alice.headers });
    expect(act.statusCode).toBe(200);
    const cookie = act.cookies.find((c) => c.name === 'qullqa_session')!;
    const asDemo = { cookie: `qullqa_session=${cookie.value}` };
    const meDemo = (await app.inject({ method: 'GET', url: '/api/me', headers: asDemo })).json();
    expect(meDemo.actingFor.adminName).toBe('Test Alice');
    expect(meDemo.isAdmin).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/admin/overview', headers: asDemo })).statusCode).toBe(403);
    const back = await app.inject({ method: 'POST', url: '/api/auth/stop-acting', headers: asDemo });
    expect(back.statusCode).toBe(200);

    // Vista de la pantalla de una familia: solo demo
    const v = await app.inject({ method: 'GET', url: `/api/admin/communities/${demo.json().id}/view/${d.demoMembers[0].userId}`, headers: alice.headers });
    expect(v.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/admin/communities/${communityId}/view/${bruno.id}`, headers: alice.headers })).statusCode).toBe(403);
    expect(d.funnel.registered).toBe(10);

    // CSV anónimos: sin nombres ni teléfonos
    for (const kind of ['parcels.csv', 'observations.csv', 'communities.csv']) {
      const csv = await app.inject({ method: 'GET', url: `/api/admin/export/${kind}`, headers: alice.headers });
      expect(csv.statusCode, kind).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      for (const leak of ['Familia Quispe', 'Test Alice', 'Test Bruno', 'demo-01', ...phones]) expect(csv.body, `${kind} ${leak}`).not.toContain(leak);
    }
    const ov = (await app.inject({ method: 'GET', url: '/api/admin/overview', headers: alice.headers })).json();
    expect(ov.funnel.registered).toBeGreaterThanOrEqual(ov.funnel.joined);
    expect(ov.obsByWeek).toHaveLength(12);
    process.env.ADMIN_PHONES = '';
  });
});
