import type { Provenance } from '@qullqa/shared';

/** Rango [mín, máx] con su procedencia: nunca un número fijo donde no hay evidencia. */
export type Range = [number, number];

export type StageName = 'inicial' | 'desarrollo' | 'media' | 'final';

export interface Stage {
  name: StageName;
  duration_decades: number;
  /**
   * Kc FAO-56 de la etapa. En 'inicial' y 'media' es constante; en 'desarrollo' y 'final' es el valor
   * al que se llega al terminar la etapa (el motor interpola linealmente, como FAO-56).
   */
  kc: number;
  /** Ky por etapa (FAO-33). Spec §15.6. */
  ky: number;
  /** Tmin (°C, ajustada a la parcela) bajo la cual hay daño letal en esta etapa. */
  frostKill_C: number;
  /** Tmax (°C) sobre la cual hay daño por calor en esta etapa. */
  heatKill_C: number;
}

export interface CropCard {
  id: string;
  name: string;
  /** Familia botánica: clave del índice de continuidad de hospederos (spec §15.9). */
  family: string;
  stages: Stage[];
  /** Raíz al sembrar y máxima (alcanzada al inicio de la etapa media). Spec §15.4. */
  rootDepth_initial_m: number;
  rootDepth_max_m: number;
  /** Fracción p de FAO-56: RAW = p × TAW. */
  p: number;
  /** Décadas del año (1 = 1–10 ene … 36 = 21–31 dic). Si inicio > fin, la ventana cruza el año. */
  sowingWindow: [number, number];
  altRange: Range;
  gdd_base: number;
  gdd_needed: number;
  fixesN: boolean;
  /** Crédito de N para el siguiente cultivo: rango, SIEMPRE 'assumed' (spec §15.7). */
  nCredit_estimated_kgha: Range;
  /** Factor C de RUSLE durante el cultivo. */
  coverFactor_C: number;
  /** Materia seca de residuo que queda en la parcela (t/ha), para el balance de MO. */
  residue_tha: Range;
  /** Grupos de plagas/enfermedades de los que es hospedero (contexto; el índice usa la familia). */
  hostOf: string[];
  /** Forraje aprovechable (kg MS/ha) y su descripción. */
  forage_kgDMha: Range;
  forageValue: string;
  /** Rendimiento comercial en condiciones sin estrés en el Colca (kg/ha). Supuesto a calibrar con cosechas. */
  yieldPotential_kgha: Range;
  priceRange_soles_kg: Range;
  costRange_soles_ha: Range;
  /** ¿Puede usarse como cultivo de cobertura? (spec §9.1) */
  coverCrop: boolean;
  source: string;
  confidence: 'alta' | 'media' | 'baja';
  /** Qué falta para subir la confianza de la ficha. */
  missing: string[];
  /** Procedencia de los parámetros agronómicos (Kc, Ky): 'estimated' si vienen de FAO, 'assumed' si son analogía. */
  paramsProvenance: Provenance;
}
