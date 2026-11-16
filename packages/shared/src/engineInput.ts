import { z } from 'zod';
import { ObservationValue } from './observations.ts';
import { PreferencesBody } from './preferences.ts';

/**
 * CONTRATO CARCASA → CEREBRO.
 * Es lo único que el motor recibe de la carcasa: una foto completa de la comunidad
 * en el momento de la corrida. Contiene datos privados: nunca se expone por la API pública;
 * solo lo genera el worker (o el script de exportación) leyendo la base de datos.
 */
export const EngineInput = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  community: z.object({
    id: z.string().uuid(),
    name: z.string(),
    center: z.tuple([z.number(), z.number()]),
  }),
  participants: z.array(
    z.object({
      userId: z.string().uuid(),
      submittedAt: z.string().nullable(),
      preferences: PreferencesBody.nullable(),
      parcels: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          /** GeoJSON Polygon en WGS84. */
          polygon: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }),
          areaHa: z.number(),
          centroid: z.tuple([z.number(), z.number()]),
          gpsAltitudeM: z.number().nullable(),
          irrigation: z.object({ source: z.string(), turnsPerMonth: z.number(), hoursPerTurn: z.number() }),
          currentRotation: z.tuple([z.string(), z.string(), z.string()]),
          /** Ids de parcelas vecinas (a ≤ 50 m), calculado con PostGIS. */
          neighborIds: z.array(z.string().uuid()),
          observations: z.array(
            z.object({
              id: z.string().uuid(),
              value: ObservationValue,
              observedAt: z.string(),
              lat: z.number().nullable(),
              lon: z.number().nullable(),
              provenance: z.literal('observed'),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type EngineInput = z.infer<typeof EngineInput>;
