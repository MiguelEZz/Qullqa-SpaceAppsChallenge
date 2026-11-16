import { z } from 'zod';
import { CropIdSchema } from './crops.ts';

/**
 * Observaciones de campo con el celular (spec sec. 5, con corrección 15.5:
 * la foto da COBERTURA VERDE por ExG, nunca «NDVI»).
 * Toda observación es provenance = 'observed'.
 */

const greenCover = z.object({
  type: z.literal('green_cover'),
  /** Fracción 0–1 de píxeles verdes (ExG = 2G−R−B, umbral Otsu), calculada en el teléfono. */
  fraction: z.number().min(0).max(1),
  otsuThreshold: z.number(),
  method: z.literal('ExG+Otsu'),
});

const residue = z.object({
  type: z.literal('residue'),
  /** Rastrojo en 1 m²: 0 = <10 %, 1 = 10–50 %, 2 = >50 %. */
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

const slope = z.object({
  type: z.literal('slope'),
  slopeDeg: z.number().min(0).max(80),
  /** Orientación hacia donde baja la ladera, 0–360 (0 = norte). Null si la brújula no está disponible. */
  aspectDeg: z.number().min(0).max(360).nullable(),
});

const phenology = z.object({
  type: z.literal('phenology'),
  crop: CropIdSchema,
  stage: z.enum(['siembra', 'emergencia', 'desarrollo', 'floracion', 'llenado', 'madurez', 'cosecha']),
  sowingDate: z.string().date().nullable(),
});

const frost = z.object({
  type: z.literal('frost'),
  severity: z.enum(['leve', 'moderada', 'fuerte']),
  /** Termómetro opcional, °C. */
  minTempC: z.number().min(-30).max(15).nullable(),
  damagedCrop: CropIdSchema.nullable(),
});

const wilting = z.object({
  type: z.literal('wilting'),
  severity: z.enum(['leve', 'moderada', 'fuerte']),
  crop: CropIdSchema.nullable(),
});

const soilMoisture = z.object({
  type: z.literal('soil_moisture'),
  /** Prueba del puño a ~15 cm. */
  fistTest: z.enum(['seco', 'humedo', 'mojado']),
});

const erosion = z.object({
  type: z.literal('erosion'),
  /** 0 = nada, 1 = surcos leves, 2 = cárcavas pequeñas, 3 = cárcavas/derrumbes. */
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

const harvest = z.object({
  type: z.literal('harvest'),
  crop: CropIdSchema,
  kg: z.number().positive().max(200000),
  /** Área cosechada en m². */
  areaM2: z.number().positive().max(1_000_000),
  harvestDate: z.string().date(),
});

export const ObservationValue = z.discriminatedUnion('type', [
  greenCover,
  residue,
  slope,
  phenology,
  frost,
  wilting,
  soilMoisture,
  erosion,
  harvest,
]);
export type ObservationValue = z.infer<typeof ObservationValue>;
export type ObservationType = ObservationValue['type'];

export const OBSERVATION_META: Record<ObservationType, { label: string; why: string; photo: 'required' | 'optional' | 'none' }> = {
  green_cover: { label: 'Cobertura verde (foto)', why: 'Estima cuánto suelo está cubierto; ayuda a calcular la erosión.', photo: 'required' },
  residue: { label: 'Rastrojo', why: 'Los restos del cultivo protegen el suelo de la lluvia.', photo: 'optional' },
  slope: { label: 'Pendiente y orientación', why: 'Una ladera más empinada pierde más suelo; la orientación cambia el frío.', photo: 'none' },
  phenology: { label: 'Etapa del cultivo', why: 'Dice en qué momento real está tu cultivo.', photo: 'optional' },
  frost: { label: 'Helada', why: 'Nos ayuda a saber si tu parcela es más fría que el promedio del valle.', photo: 'optional' },
  wilting: { label: 'Marchitez', why: 'Confirma si las plantas sufren por falta de agua.', photo: 'optional' },
  soil_moisture: { label: 'Humedad del suelo (puño)', why: 'Compara la humedad real con la del satélite.', photo: 'none' },
  erosion: { label: 'Erosión', why: 'Confirma dónde se está perdiendo suelo.', photo: 'optional' },
  harvest: { label: 'Cosecha', why: 'Es el dato más valioso: calibra todo el modelo.', photo: 'none' },
};

export const ObservationBody = z.object({
  value: ObservationValue,
  /** Dónde se tomó (GPS), opcional. */
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nullable(),
  observedAt: z.string().datetime(),
  /** Miniatura JPEG en data URL (≤ ~300 KB). */
  photo: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(420_000)
    .nullable(),
});
export type ObservationBody = z.infer<typeof ObservationBody>;

export const Observation = z.object({
  id: z.string().uuid(),
  parcelId: z.string().uuid(),
  value: ObservationValue,
  observedAt: z.string(),
  hasPhoto: z.boolean(),
  provenance: z.literal('observed'),
});
export type Observation = z.infer<typeof Observation>;
