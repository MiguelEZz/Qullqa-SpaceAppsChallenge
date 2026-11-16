import { sql } from './db.ts';

/**
 * Catálogo de comunidades de la sierra de Arequipa (pueblo/distrito de referencia).
 * La ubicación es la del pueblo (aproximada): sirve para centrar el mapa y validar que la parcela
 * esté a ≤ 40 km; NO delimita un área. La comunidad la forman quienes se unen y marcan sus parcelas.
 *
 * `valley`: dataset NASA procesado que cubre el pueblo (hoy solo el corredor Chivay–Yanque–Coporaque).
 * Sin dataset el plan no se calcula: usar el clima de otro valle sería presentar una estimación falsa.
 */
export interface CatalogCommunity {
  slug: string;
  name: string;
  district: string;
  province: string;
  lonLat: [number, number];
  altitudeM: number;
  valley?: string;
}

const COLCA = 'colca-chivay-yanque-coporaque';

export const COMMUNITY_CATALOG: CatalogCommunity[] = [
  // Caylloma — valle del Colca (piloto)
  { slug: 'chivay', name: 'Chivay', district: 'Chivay', province: 'Caylloma', lonLat: [-71.601, -15.638], altitudeM: 3635, valley: COLCA },
  { slug: 'yanque', name: 'Yanque', district: 'Yanque', province: 'Caylloma', lonLat: [-71.659, -15.649], altitudeM: 3417, valley: COLCA },
  { slug: 'coporaque', name: 'Coporaque', district: 'Coporaque', province: 'Caylloma', lonLat: [-71.646, -15.627], altitudeM: 3570, valley: COLCA },
  { slug: 'achoma', name: 'Achoma', district: 'Achoma', province: 'Caylloma', lonLat: [-71.699, -15.660], altitudeM: 3450, valley: COLCA },
  { slug: 'ichupampa', name: 'Ichupampa', district: 'Ichupampa', province: 'Caylloma', lonLat: [-71.690, -15.615], altitudeM: 3400, valley: COLCA },
  { slug: 'maca', name: 'Maca', district: 'Maca', province: 'Caylloma', lonLat: [-71.768, -15.642], altitudeM: 3262 },
  { slug: 'lari', name: 'Lari', district: 'Lari', province: 'Caylloma', lonLat: [-71.770, -15.623], altitudeM: 3310 },
  { slug: 'madrigal', name: 'Madrigal', district: 'Madrigal', province: 'Caylloma', lonLat: [-71.811, -15.615], altitudeM: 3262 },
  { slug: 'cabanaconde', name: 'Cabanaconde', district: 'Cabanaconde', province: 'Caylloma', lonLat: [-71.979, -15.620], altitudeM: 3287 },
  { slug: 'tapay', name: 'Tapay', district: 'Tapay', province: 'Caylloma', lonLat: [-71.941, -15.580], altitudeM: 2950 },
  { slug: 'tuti', name: 'Tuti', district: 'Tuti', province: 'Caylloma', lonLat: [-71.556, -15.533], altitudeM: 3833 },
  { slug: 'sibayo', name: 'Sibayo', district: 'Sibayo', province: 'Caylloma', lonLat: [-71.457, -15.486], altitudeM: 3810 },
  { slug: 'callalli', name: 'Callalli', district: 'Callalli', province: 'Caylloma', lonLat: [-71.445, -15.507], altitudeM: 3860 },
  { slug: 'huambo', name: 'Huambo', district: 'Huambo', province: 'Caylloma', lonLat: [-72.105, -15.734], altitudeM: 3332 },
  { slug: 'lluta', name: 'Lluta', district: 'Lluta', province: 'Caylloma', lonLat: [-72.014, -16.014], altitudeM: 3000 },
  { slug: 'huanca', name: 'Huanca', district: 'Huanca', province: 'Caylloma', lonLat: [-71.879, -16.033], altitudeM: 3080 },
  // Castilla
  { slug: 'andagua', name: 'Andagua', district: 'Andagua', province: 'Castilla', lonLat: [-72.354, -15.499], altitudeM: 3587 },
  { slug: 'chachas', name: 'Chachas', district: 'Chachas', province: 'Castilla', lonLat: [-72.269, -15.499], altitudeM: 3100 },
  { slug: 'orcopampa', name: 'Orcopampa', district: 'Orcopampa', province: 'Castilla', lonLat: [-72.341, -15.263], altitudeM: 3800 },
  { slug: 'viraco', name: 'Viraco', district: 'Viraco', province: 'Castilla', lonLat: [-72.524, -15.658], altitudeM: 3200 },
  { slug: 'pampacolca', name: 'Pampacolca', district: 'Pampacolca', province: 'Castilla', lonLat: [-72.569, -15.714], altitudeM: 2900 },
  // Condesuyos y La Unión
  { slug: 'chuquibamba', name: 'Chuquibamba', district: 'Chuquibamba', province: 'Condesuyos', lonLat: [-72.650, -15.839], altitudeM: 2900 },
  { slug: 'cotahuasi', name: 'Cotahuasi', district: 'Cotahuasi', province: 'La Unión', lonLat: [-72.892, -15.213], altitudeM: 2680 },
  { slug: 'alca', name: 'Alca', district: 'Alca', province: 'La Unión', lonLat: [-72.764, -15.138], altitudeM: 2800 },
  { slug: 'puyca', name: 'Puyca', district: 'Puyca', province: 'La Unión', lonLat: [-72.692, -15.058], altitudeM: 3650 },
  // Arequipa (campiña alta y zonas altas)
  { slug: 'uchumayo', name: 'Uchumayo', district: 'Uchumayo', province: 'Arequipa', lonLat: [-71.671, -16.424], altitudeM: 1950 },
  { slug: 'yura', name: 'Yura', district: 'Yura', province: 'Arequipa', lonLat: [-71.689, -16.251], altitudeM: 2590 },
  { slug: 'chiguata', name: 'Chiguata', district: 'Chiguata', province: 'Arequipa', lonLat: [-71.391, -16.402], altitudeM: 2950 },
  { slug: 'characato', name: 'Characato', district: 'Characato', province: 'Arequipa', lonLat: [-71.485, -16.471], altitudeM: 2450 },
  { slug: 'pocsi', name: 'Pocsi', district: 'Pocsi', province: 'Arequipa', lonLat: [-71.393, -16.515], altitudeM: 3050 },
  { slug: 'polobaya', name: 'Polobaya', district: 'Polobaya', province: 'Arequipa', lonLat: [-71.371, -16.564], altitudeM: 3100 },
];

/** Inserta o actualiza el catálogo (idempotente). Se llama al arrancar la API. */
export async function seedCommunities() {
  for (const c of COMMUNITY_CATALOG) {
    const [lon, lat] = c.lonLat;
    await sql`
      insert into communities (slug, name, district, province, region, altitude_m, valley_id, listed, center)
      values (${c.slug}, ${c.name}, ${c.district}, ${c.province}, 'Arequipa', ${c.altitudeM}, ${c.valley ?? null}, true,
              ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)
      on conflict (slug) do update set name = excluded.name, district = excluded.district, province = excluded.province,
        region = excluded.region, altitude_m = excluded.altitude_m, valley_id = excluded.valley_id, listed = true, center = excluded.center`;
  }
}
