import type { CropCard, Stage } from './types.ts';

/**
 * Catálogo MVP del Colca (sierra, ~3 400–3 900 m). Spec §4.
 *
 * Fuentes:
 *  - Kc: FAO-56 (Allen et al., 1998), Tabla 12. Duraciones alargadas para altura (ciclos más lentos con frío).
 *  - Ky por etapa: FAO-33 (Doorenbos & Kassam, 1979), Tabla 24 / fichas por cultivo.
 *  - Raíz y p: FAO-56, Tabla 22.
 *  - Tubérculos andinos (olluco, oca) y tarwi NO tienen valores FAO: se usan por analogía (papa,
 *    leguminosas) y se marcan como supuesto (paramsProvenance 'assumed', confianza baja).
 *  - Precios, costos y rendimientos: rangos de referencia para la sierra de Arequipa, SUPUESTOS a
 *    contrastar con MIDAGRI/SISAP e INIA. Las cosechas registradas por los agricultores los calibran.
 * Regla del proyecto: si una ficha INIA contradice a FAO, prevalece INIA (pendiente: `missing`).
 */

/** Ayuda para escribir etapas: [duración en décadas, kc, ky, helada letal °C, calor °C]. */
// En la etapa inicial los tubérculos (papa, olluco, oca) están bajo tierra: el límite de helada es más bajo.
const st = (name: Stage['name'], d: number, kc: number, ky: number, frost: number, heat: number): Stage => ({
  name, duration_decades: d, kc, ky, frostKill_C: frost, heatKill_C: heat,
});

const FAO = 'Kc FAO-56 (Tabla 12); Ky FAO-33; raíz y p FAO-56 (Tabla 22); precios y costos supuestos';
const ANALOGY = 'Sin valores FAO: Kc/Ky por analogía (supuesto); precios y costos supuestos';
const INIA = 'Contrastar duraciones, rendimiento y helada con fichas INIA para el Colca';

export const CROPS: CropCard[] = [
  {
    id: 'papa', name: 'Papa', family: 'Solanaceae',
    stages: [st('inicial', 3, 0.5, 0.45, -3, 30), st('desarrollo', 4, 1.15, 0.8, -1.5, 30), st('media', 5, 1.15, 0.7, -2, 30), st('final', 4, 0.75, 0.2, -3, 32)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.5, p: 0.35,
    sowingWindow: [27, 34], altRange: [2500, 4000], gdd_base: 2, gdd_needed: 1100,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.4, residue_tha: [0.5, 1.5],
    hostOf: ['gorgojo de los Andes (Premnotrypes)', 'polilla de la papa', 'nematodo del quiste', 'rancha (Phytophthora)'],
    forage_kgDMha: [0, 300], forageValue: 'Bajo (follaje tras cosecha)',
    yieldPotential_kgha: [10000, 20000], priceRange_soles_kg: [0.6, 1.5], costRange_soles_ha: [7000, 11000],
    coverCrop: false, source: FAO, confidence: 'media', missing: [INIA, 'Variedad (nativa o mejorada) cambia ciclo y helada'], paramsProvenance: 'estimated',
  },
  {
    id: 'olluco', name: 'Olluco', family: 'Basellaceae',
    stages: [st('inicial', 4, 0.5, 0.45, -3, 28), st('desarrollo', 5, 1.05, 0.8, -1.5, 28), st('media', 7, 1.05, 0.7, -2, 28), st('final', 4, 0.7, 0.2, -3, 30)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.45, p: 0.35,
    sowingWindow: [26, 33], altRange: [2800, 4000], gdd_base: 2, gdd_needed: 1400,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.35, residue_tha: [0.5, 1.5],
    hostOf: ['gorgojos de tubérculos andinos', 'nematodos'],
    forage_kgDMha: [0, 300], forageValue: 'Bajo',
    yieldPotential_kgha: [5000, 10000], priceRange_soles_kg: [1.0, 2.5], costRange_soles_ha: [5000, 8000],
    coverCrop: false, source: ANALOGY + ' (papa)', confidence: 'baja', missing: [INIA, 'Kc y Ky medidos para olluco'], paramsProvenance: 'assumed',
  },
  {
    id: 'oca', name: 'Oca', family: 'Oxalidaceae',
    stages: [st('inicial', 4, 0.5, 0.45, -3, 28), st('desarrollo', 6, 1.05, 0.8, -1.5, 28), st('media', 8, 1.05, 0.7, -2, 28), st('final', 4, 0.7, 0.2, -3, 30)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.45, p: 0.35,
    sowingWindow: [26, 33], altRange: [2800, 4000], gdd_base: 2, gdd_needed: 1500,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.35, residue_tha: [0.5, 1.5],
    hostOf: ['gorgojo de la oca', 'nematodos'],
    forage_kgDMha: [0, 300], forageValue: 'Bajo',
    yieldPotential_kgha: [6000, 12000], priceRange_soles_kg: [0.8, 2.0], costRange_soles_ha: [5000, 8000],
    coverCrop: false, source: ANALOGY + ' (papa)', confidence: 'baja', missing: [INIA, 'Kc y Ky medidos para oca'], paramsProvenance: 'assumed',
  },
  {
    id: 'haba', name: 'Haba', family: 'Fabaceae',
    stages: [st('inicial', 3, 0.5, 0.2, -4, 30), st('desarrollo', 4, 1.15, 0.6, -3, 30), st('media', 7, 1.15, 1.0, -2, 30), st('final', 4, 0.3, 0.2, -3, 32)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.7, p: 0.45,
    sowingWindow: [24, 31], altRange: [2500, 3900], gdd_base: 3, gdd_needed: 1300,
    fixesN: true, nCredit_estimated_kgha: [20, 60], coverFactor_C: 0.3, residue_tha: [1.5, 3],
    hostOf: ['pulgones', 'mancha chocolate (Botrytis)'],
    forage_kgDMha: [1000, 2000], forageValue: 'Medio (broza/paja de haba)',
    yieldPotential_kgha: [1200, 2200], priceRange_soles_kg: [3, 5], costRange_soles_ha: [3500, 5500],
    coverCrop: false, source: FAO + ' (haba seca / frijol)', confidence: 'media', missing: [INIA, 'Crédito real de N depende de residuos y manejo'], paramsProvenance: 'estimated',
  },
  {
    id: 'tarwi', name: 'Tarwi', family: 'Fabaceae',
    stages: [st('inicial', 4, 0.4, 0.2, -4, 30), st('desarrollo', 6, 1.0, 0.5, -3, 30), st('media', 7, 1.0, 0.7, -2.5, 30), st('final', 4, 0.35, 0.15, -3, 32)],
    rootDepth_initial_m: 0.2, rootDepth_max_m: 1.5, p: 0.6,
    sowingWindow: [27, 33], altRange: [2500, 3800], gdd_base: 3, gdd_needed: 1500,
    fixesN: true, nCredit_estimated_kgha: [30, 80], coverFactor_C: 0.25, residue_tha: [2, 4],
    hostOf: ['antracnosis', 'barrenadores de tallo'],
    forage_kgDMha: [0, 0], forageValue: 'Nulo (alcaloides amargos; no se da al ganado)',
    yieldPotential_kgha: [800, 1500], priceRange_soles_kg: [5, 8], costRange_soles_ha: [3000, 4500],
    coverCrop: false, source: ANALOGY + ' (leguminosas); raíz ~1,5 m según especificación', confidence: 'baja', missing: [INIA, 'Kc y Ky medidos para tarwi'], paramsProvenance: 'assumed',
  },
  {
    id: 'arveja', name: 'Arveja', family: 'Fabaceae',
    stages: [st('inicial', 2, 0.5, 0.2, -3, 28), st('desarrollo', 3, 1.15, 0.5, -2, 28), st('media', 5, 1.15, 0.9, -1.5, 28), st('final', 3, 0.3, 0.2, -2, 30)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.8, p: 0.35,
    sowingWindow: [28, 35], altRange: [2500, 3700], gdd_base: 4, gdd_needed: 900,
    fixesN: true, nCredit_estimated_kgha: [15, 40], coverFactor_C: 0.3, residue_tha: [1, 2],
    hostOf: ['pulgones', 'oídio', 'ascochyta'],
    forage_kgDMha: [800, 1500], forageValue: 'Medio (paja de arveja)',
    yieldPotential_kgha: [900, 1600], priceRange_soles_kg: [3, 5], costRange_soles_ha: [3000, 4500],
    coverCrop: false, source: FAO + ' (arveja seca)', confidence: 'media', missing: [INIA], paramsProvenance: 'estimated',
  },
  {
    id: 'quinua', name: 'Quinua', family: 'Amaranthaceae',
    stages: [st('inicial', 3, 0.5, 0.2, -5, 32), st('desarrollo', 5, 1.0, 0.3, -4, 32), st('media', 6, 1.0, 0.5, -2, 30), st('final', 3, 0.7, 0.1, -4, 32)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 1.0, p: 0.6,
    sowingWindow: [27, 33], altRange: [2500, 4000], gdd_base: 3, gdd_needed: 1200,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.3, residue_tha: [1, 2],
    hostOf: ['kona kona (polilla de la quinua)', 'mildiu (Peronospora)'],
    forage_kgDMha: [300, 800], forageValue: 'Bajo (jipi y tallos)',
    yieldPotential_kgha: [1200, 2500], priceRange_soles_kg: [4, 7], costRange_soles_ha: [4000, 6000],
    coverCrop: false, source: 'Kc de literatura de quinua en el altiplano (Garcia et al., 2003; supuesto); Ky bajo según especificación (~0,3); precios y costos supuestos', confidence: 'media', missing: [INIA, 'Ky por etapa medido'], paramsProvenance: 'assumed',
  },
  {
    id: 'cebada', name: 'Cebada', family: 'Poaceae',
    stages: [st('inicial', 2, 0.3, 0.2, -6, 32), st('desarrollo', 4, 1.15, 0.4, -5, 32), st('media', 6, 1.15, 0.6, -2, 30), st('final', 3, 0.25, 0.2, -4, 32)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 1.0, p: 0.55,
    sowingWindow: [34, 2], altRange: [2800, 4000], gdd_base: 0, gdd_needed: 1400,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.15, residue_tha: [1, 2.5],
    hostOf: ['roya amarilla', 'pulgones de cereales'],
    forage_kgDMha: [1500, 3000], forageValue: 'Medio (paja)',
    yieldPotential_kgha: [1500, 2800], priceRange_soles_kg: [1.2, 2.0], costRange_soles_ha: [2000, 3000],
    coverCrop: false, source: FAO + ' (cebada; Ky de cereales de grano pequeño)', confidence: 'media', missing: [INIA], paramsProvenance: 'estimated',
  },
  {
    id: 'avena_forrajera', name: 'Avena forrajera', family: 'Poaceae',
    stages: [st('inicial', 2, 0.3, 0.3, -6, 32), st('desarrollo', 4, 1.0, 0.6, -5, 32), st('media', 6, 1.0, 0.8, -4, 30), st('final', 2, 0.9, 0.4, -4, 32)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 0.8, p: 0.55,
    sowingWindow: [31, 2], altRange: [2800, 4200], gdd_base: 0, gdd_needed: 1000,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.08, residue_tha: [0.3, 1],
    hostOf: ['roya de la hoja', 'pulgones de cereales'],
    forage_kgDMha: [6000, 10000], forageValue: 'Alto (forraje verde o heno)',
    // Rendimiento en forraje verde; se vende o se ahorra en alimento de ganado
    yieldPotential_kgha: [20000, 35000], priceRange_soles_kg: [0.15, 0.3], costRange_soles_ha: [2500, 3500],
    coverCrop: true, source: 'Kc FAO-56 (avena, corte en verde; supuesto en etapa final); Ky por analogía con forrajes; precios supuestos', confidence: 'media', missing: [INIA], paramsProvenance: 'assumed',
  },
  {
    id: 'maiz_amilaceo', name: 'Maíz amiláceo (Cabanita)', family: 'Poaceae',
    stages: [st('inicial', 3, 0.3, 0.4, 0, 35), st('desarrollo', 6, 1.2, 0.4, -0.5, 35), st('media', 7, 1.2, 1.5, -0.5, 33), st('final', 4, 0.35, 0.2, -1.5, 35)],
    rootDepth_initial_m: 0.15, rootDepth_max_m: 1.0, p: 0.55,
    sowingWindow: [25, 30], altRange: [2500, 3600], gdd_base: 6, gdd_needed: 1100,
    fixesN: false, nCredit_estimated_kgha: [0, 0], coverFactor_C: 0.4, residue_tha: [1, 2],
    hostOf: ['gusano de la mazorca', 'cogollero'],
    forage_kgDMha: [2000, 4000], forageValue: 'Medio-alto (chala)',
    yieldPotential_kgha: [1500, 3000], priceRange_soles_kg: [3, 5], costRange_soles_ha: [4000, 6000],
    coverCrop: false, source: FAO + ' (maíz grano); base térmica 6 °C para razas andinas (supuesto)', confidence: 'media', missing: [INIA, 'Ciclo real de Cabanita en el Colca (6–7 meses)'], paramsProvenance: 'estimated',
  },
];

/** «Descanso» (barbecho con vegetación natural): sin cultivo, sin ingreso, protege el suelo. */
export const FALLOW = {
  id: 'descanso', name: 'Descanso', family: 'ninguna', coverFactor_C: 0.2,
  forage_kgDMha: [800, 1500] as [number, number], residue_tha: [0.5, 1] as [number, number], kc: 0.3,
  source: 'Factor C y forraje del barbecho andino: supuestos',
};

export const CROP_BY_ID: Record<string, CropCard> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

export const cycleDecades = (c: CropCard) => c.stages.reduce((s, x) => s + x.duration_decades, 0);
