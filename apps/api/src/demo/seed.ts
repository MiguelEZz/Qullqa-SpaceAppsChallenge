import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Constraints, CropId, FocusId, ObservationValue } from '@qullqa/shared';
import { ASSUMPTIONS, coinsFromFocus } from '@qullqa/catalog';
import { sql } from '../db.ts';
import { hashPin } from '../security.ts';

/**
 * Comunidad DEMO (simulada) para probar el cerebro de punta a punta: 10 familias SINTÉTICAS con 20 chacras
 * REALES de los andenes bajos de Yanque (bordes trazados sobre la imagen satelital, altura NASA SRTM; ver fields.json).
 * Todo queda marcado is_demo: no entra en las estadísticas reales, nadie puede ingresar con estas cuentas
 * (el teléfono no es válido) y solo un administrador puede «ver como» una de estas familias.
 */
export const DEMO_SLUG = 'demo-colca';

type Field = { key: string; ring: [number, number][]; elevationM: number; slopeDeg: number };
const FIELDS = (JSON.parse(readFileSync(new URL('./fields.json', import.meta.url), 'utf8')) as { fields: Field[] }).fields;
const FIELD = new Map(FIELDS.map((f) => [f.key, f]));
/** Chacras más bajas (fila D): el aire frío se junta ahí → reportes de helada. */
const LOW_ROW = new Set(['D1', 'D2', 'D3', 'D4', 'C3', 'C4']);

type Rot = [string, string, string];
interface Family {
  name: string;
  /** «¿Qué te importa más?» (1–2 tarjetas), como lo elegiría la familia en la app. */
  focus: FocusId[];
  constraints: Constraints;
  vetoes: string[];
  /** [chacra de fields.json, rotación de las 3 últimas campañas] */
  parcels: [string, Rot][];
}

const C = (traction: Constraints['traction'], familyWorkers: number, canGetExtraLabor: boolean, market: Constraints['market'], livestockHeads: number): Constraints =>
  ({ traction, familyWorkers, canGetExtraLabor, market, livestockHeads });

// Perfiles variados a propósito: comerciales, ganaderos, conservacionistas, adversos al riesgo.
// La papa domina (como en el valle real): así se ve el efecto de coordinar sobre plagas y precio.
const FAMILIES: Family[] = [
  { name: 'Familia Quispe', focus: ['money', 'safeHarvest'], constraints: C('yunta', 3, true, 'feria_local', 4), vetoes: [],
    parcels: [['A1', ['papa', 'haba', 'papa']], ['A2', ['papa', 'papa', 'cebada']]] },
  { name: 'Familia Mamani', focus: ['animals', 'money'], constraints: C('yunta', 2, true, 'mixto', 14), vetoes: ['olluco'],
    parcels: [['B6', ['cebada', 'papa', 'haba']], ['B5', ['avena_forrajera', 'papa', 'papa']]] },
  { name: 'Familia Huamaní', focus: ['goodLand'], constraints: C('manual', 2, false, 'autoconsumo', 3), vetoes: [],
    parcels: [['B1', ['papa', 'haba', 'descanso']], ['B7', ['quinua', 'papa', 'haba']]] },
  { name: 'Familia Condori', focus: ['safeHarvest'], constraints: C('yunta', 4, true, 'autoconsumo', 6), vetoes: [],
    parcels: [['B2', ['papa', 'papa', 'haba']], ['B3', ['maiz_amilaceo', 'papa', 'papa']]] },
  { name: 'Familia Cutipa', focus: ['money'], constraints: C('tractor', 2, true, 'intermediario', 0), vetoes: ['tarwi'],
    parcels: [['B4', ['papa', 'papa', 'papa']], ['C1', ['papa', 'haba', 'papa']]] },
  { name: 'Familia Ccama', focus: ['money', 'animals'], constraints: C('yunta', 3, true, 'mixto', 8), vetoes: [],
    parcels: [['C2', ['maiz_amilaceo', 'haba', 'papa']], ['C4', ['haba', 'papa', 'cebada']]] },
  { name: 'Familia Choque', focus: ['safeHarvest', 'goodLand'], constraints: C('manual', 1, false, 'autoconsumo', 2), vetoes: ['maiz_amilaceo'],
    parcels: [['C3', ['papa', 'oca', 'haba']], ['D4', ['olluco', 'papa', 'haba']]] },
  { name: 'Familia Taco', focus: ['money', 'goodLand'], constraints: C('yunta', 2, true, 'feria_local', 5), vetoes: [],
    parcels: [['D1', ['papa', 'haba', 'papa']], ['D3', ['cebada', 'papa', 'papa']]] },
  { name: 'Familia Huaracha', focus: ['animals', 'safeHarvest'], constraints: C('yunta', 3, true, 'autoconsumo', 20), vetoes: [],
    parcels: [['D2', ['papa', 'cebada', 'descanso']], ['C5', ['avena_forrajera', 'papa', 'cebada']]] },
  { name: 'Familia Llica', focus: ['safeHarvest', 'money'], constraints: C('manual', 3, true, 'feria_local', 4), vetoes: [],
    parcels: [['A3', ['papa', 'haba', 'papa']], ['E2', ['oca', 'papa', 'papa']]] },
];


/** Observaciones de campo sintéticas pero plausibles (heladas más arriba, cosechas, prueba del puño, pendiente). */
function observationsFor(field: Field, k: number, rot: Rot, f: number): { value: ObservationValue; daysAgo: number }[] {
  const out: { value: ObservationValue; daysAgo: number }[] = [];
  out.push({ value: { type: 'slope', slopeDeg: Math.round((field.slopeDeg + 1) * 10) / 10, aspectDeg: 170 + ((f * 13) % 40) }, daysAgo: 20 + k });
  out.push({ value: { type: 'soil_moisture', fistTest: (f + k) % 2 ? 'humedo' : 'seco' }, daysAgo: 3 + f });
  if (rot[2] !== 'descanso' && (f + k) % 2 === 0) {
    const tha: Record<string, number> = { papa: 11, haba: 2.2, cebada: 2.4, maiz_amilaceo: 2.6, quinua: 1.6, oca: 7, olluco: 6, avena_forrajera: 9 };
    const kgHa = (tha[rot[2]] ?? 3) * 1000 * (0.85 + ((f * 7 + k * 3) % 10) / 33);
    out.push({ value: { type: 'harvest', crop: rot[2] as CropId, kg: Math.round(kgHa * 0.3), areaM2: 3000, harvestDate: '2026-05-20' }, daysAgo: 178 });
  }
  if (LOW_ROW.has(field.key)) out.push({ value: { type: 'frost', severity: 'leve', minTempC: -2.5, damagedCrop: rot[2] === 'descanso' ? null : (rot[2] as CropId) }, daysAgo: 230 + k });
  if (k === 0) out.push({ value: { type: 'green_cover', fraction: 0.15 + (f % 4) * 0.05, otsuThreshold: 21, method: 'ExG+Otsu' }, daysAgo: 6 });
  return out;
}

/** Borra y vuelve a crear la comunidad demo con todos sus datos enviados. Devuelve su id. */
export async function seedDemoCommunity(now = new Date()): Promise<string> {
  const all = FIELDS.flatMap((x) => x.ring);
  const center: [number, number] = [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length];
  return sql.begin(async (tx) => {
    await tx`delete from communities where slug = ${DEMO_SLUG}`;
    await tx`delete from users where is_demo`;
    const [c] = await tx<{ id: string }[]>`
      insert into communities (slug, name, district, province, region, altitude_m, valley_id, listed, is_demo, center)
      values (${DEMO_SLUG}, 'Demo: chacras de Yanque (simulada)', 'Yanque', 'Caylloma', 'Arequipa', 3435,
              'colca-chivay-yanque-coporaque', false, true, ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326)::geography)
      returning id`;
    const cid = c!.id;
    for (const [f, fam] of FAMILIES.entries()) {
      // Teléfono inválido a propósito: nadie puede iniciar sesión con estas cuentas
      const [u] = await tx<{ id: string }[]>`
        insert into users (name, phone, pin_hash, is_demo, terms_accepted_at, terms_version)
        values (${`${fam.name} (demo)`}, ${`demo-${String(f + 1).padStart(2, '0')}`}, ${await hashPin(randomBytes(8).toString('hex'))}, true, now(), 'demo')
        returning id`;
      const uid = u!.id;
      await tx`insert into memberships (user_id, community_id, joined_at, submitted_at) values (${uid}, ${cid}, ${now}, ${now})`;
      const coins = coinsFromFocus(fam.focus, { livestockHeads: fam.constraints.livestockHeads, market: fam.constraints.market, hasRainfedParcel: false }, ASSUMPTIONS);
      await tx`insert into preferences (user_id, community_id, focus, coins, coins_source, constraints, vetoes)
               values (${uid}, ${cid}, ${fam.focus}, ${tx.json(coins)}, 'cards', ${tx.json(fam.constraints)}, ${fam.vetoes})`;
      for (const [k, [key, rot]] of fam.parcels.entries()) {
        const field = FIELD.get(key)!;
        const ring = [...field.ring, field.ring[0]!];
        const geo = JSON.stringify({ type: 'Polygon', coordinates: [ring] });
        const irrigation = { source: 'canal', turnsPerMonth: 2 + ((f + k) % 3), hoursPerTurn: 3 };
        const [c0, c1] = [field.ring.reduce((s, p) => s + p[0], 0) / field.ring.length, field.ring.reduce((s, p) => s + p[1], 0) / field.ring.length];
        const [p] = await tx<{ id: string }[]>`
          insert into parcels (community_id, owner_id, name, polygon, capture_method, gps_altitude_m, irrigation, current_rotation)
          values (${cid}, ${uid}, ${`Chacra ${key}`}, ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326)::geography, 'draw',
                  ${field.elevationM}, ${tx.json(irrigation)}, ${rot})
          returning id`;
        for (const o of observationsFor(field, k, rot, f)) {
          const at = new Date(now.getTime() - o.daysAgo * 86_400_000);
          await tx`insert into observations (parcel_id, user_id, type, value, lat, lon, observed_at)
                   values (${p!.id}, ${uid}, ${o.value.type}, ${tx.json(o.value)}, ${c1}, ${c0}, ${at})`;
        }
      }

    }
    return cid;
  });
}
