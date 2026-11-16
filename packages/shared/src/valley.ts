import type { Provenance } from './index.ts';

/**
 * CONTRATO DATOS → MOTOR: el dataset del valle (spec §2, §15.2).
 * Cada variable mantiene su propia serie y su cobertura real de años: nunca hay
 * una «serie única de 40 años». Lo arma `packages/data` (con red); el motor solo lo lee.
 */

/** Ficha de una fuente: producto original + productor + vía de acceso (regla de etiquetado). */
export interface SourceInfo {
  id: string;
  /** p. ej. «NASA POWER Daily v2.10 (NASA LaRC; MERRA-2)» */
  product: string;
  producer: string;
  /** p. ej. «API POWER» o «vía Microsoft Planetary Computer» */
  access: string;
  isNasa: boolean;
  resolution: string;
  /** Cobertura real: primer y último día con dato (YYYY-MM-DD), o null si es estático. */
  coverage: { start: string; end: string } | null;
  provenance: Provenance;
  notes?: string;
}

/** Serie diaria columnar (compacta en JSON). Todas las columnas tienen la misma longitud que `dates`. */
export interface DailyClimate {
  dates: string[];
  tmax: number[];
  tmin: number[];
  t2m: number[];
  rh: number[];
  wind: number[];
  /** MJ/m²/día. POWER no tiene radiación antes de 1984-01-01 → null (el motor usa Hargreaves). */
  rad: (number | null)[];
  rain: number[];
  /** Lluvia original de POWER si `rain` fue corregida por sesgo (IMERG). */
  rainRaw?: number[];
  /** Humedad relativa de la zona radicular, 0–1 (contexto del valle, ~0,5°). */
  gwetroot: (number | null)[];
}

export interface SoilProfile {
  /** Promedio ponderado 0–30 cm. */
  clayPct: number;
  sandPct: number;
  siltPct: number;
  /** Carbono orgánico del suelo, %. */
  socPct: number;
  /** Materia orgánica ≈ SOC × 1,724 (factor de van Bemmelen; supuesto). */
  omPct: number;
  ph: number;
  bulkDensity_gcm3: number;
  source: string;
}

export interface TerrainInfo {
  elevationM: number;
  slopeDeg: number;
  /** Grados desde el norte, sentido horario. */
  aspectDeg: number;
  source: string;
}

export interface NdviSeries {
  /** Fecha de composición MODIS (YYYY-MM-DD). */
  dates: string[];
  /** NDVI −1..1, null si el píxel no es utilizable. */
  ndvi: (number | null)[];
  quality: ('good' | 'marginal' | 'cloudy' | 'nodata')[];
  pixelSizeM: number;
  source: string;
}

export interface LandCover {
  /** Clase ESA WorldCover (40 = cropland). */
  class: number;
  label: string;
  /** Fracción de cultivo en el cuadro de 250 m (píxel MODIS) alrededor del punto: pureza del NDVI. */
  cropFraction250m: number;
  /** Punto original si se movió al lugar con más cultivo. */
  snappedFrom: [number, number] | null;
  source: string;
}

/** Temperatura de superficie nocturna MODIS (Aqua, ~01:30), 8 días. */
export interface LstSeries {
  dates: string[];
  lstNight_C: (number | null)[];
  source: string;
}

/**
 * δ_posición por mes (°C): cuánto más frío es el valle de noche que la celda POWER corregida por altitud.
 * Tmin_parcela = Tmin_celda − lapse·Δz − δ[mes]. Estimado con LST nocturna MODIS (no es temperatura del aire).
 */
export interface DeltaPosition {
  byMonth: number[];
  provenance: Provenance;
  source: string;
  method: string;
}

/** Punto de muestreo representativo del corredor (andenes con cultivo). */
export interface Site {
  id: string;
  name: string;
  lonLat: [number, number];
  terrain: TerrainInfo | null;
  soil: SoilProfile | null;
  ndvi: NdviSeries | null;
  landCover: LandCover | null;
  lstNight: LstSeries | null;
  deltaPosition: DeltaPosition | null;
}

export interface ValleyDataset {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Hash corto del contenido: entra en el snapshot de cada corrida. */
  version: string;
  createdAt: string;
  center: [number, number];
  climate: {
    /** Centro y elevación de la celda POWER (MERRA-2): z_celda para corregir temperatura. */
    cell: { lon: number; lat: number; elevationM: number };
    daily: DailyClimate;
    /** Corrección de sesgo de la lluvia con GPM IMERG mensual (null si no se aplicó). */
    rainCorrection: { factorByMonth: number[]; years: [number, number]; method: string; source: string } | null;
  };
  sites: Site[];
  sources: Record<string, SourceInfo>;
  /** Avisos honestos del pipeline (fuentes que fallaron, rellenos, etc.). */
  warnings: string[];
}
