import { z } from 'zod';
import { SeasonUse } from './crops.ts';

export * from './crops.ts';
export * from './observations.ts';
export * from './preferences.ts';
export * from './engineInput.ts';
export type * from './valley.ts';

/**
 * Procedencia de cada valor (spec 15.1). Ningún número llega a la UI sin ella.
 * - observed:  medición directa o registro verificable (cosecha pesada, reporte de helada)
 * - estimated: producto de un modelo o satélite (POWER, NDVI, SoilGrids, Tmin ajustada)
 * - simulated: salida del motor (Yrel, estrés hídrico)
 * - assumed:   parámetro sin evidencia suficiente, usado para explorar (elasticidad, crédito de N)
 */
export const Provenance = z.enum(['observed', 'estimated', 'simulated', 'assumed']);
export type Provenance = z.infer<typeof Provenance>;

/** Un valor con su procedencia y fuente (producto + productor + vía de acceso). */
export const Traced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, provenance: Provenance, source: z.string() });

export const DISCLAIMER =
  'Esta herramienta apoya la decisión; no reemplaza su experiencia ni la de un técnico agrícola.';

// ───────────────────────── Salud ─────────────────────────
export const HealthResponse = z.object({
  ok: z.boolean(),
  service: z.literal('qullqa-api'),
  db: z.object({ ok: z.boolean(), postgis: z.string().nullable() }),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ───────────────────────── Auth ─────────────────────────
export const Phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{9,12}$/, 'Número de celular no válido'));
export const Pin = z.string().regex(/^\d{4}$/, 'El PIN son 4 números');

/** Versión vigente de los términos y la política de privacidad (se guarda con la aceptación). */
export const TERMS_VERSION = '2026-11-14';

export const Name = z.string().trim().min(2, 'Escribe tu nombre').max(60);

export const RegisterBody = z.object({
  name: Name,
  phone: Phone,
  pin: Pin,
  acceptTerms: z.literal(true, { error: 'Debes aceptar los términos y la política de privacidad' }),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({ phone: Phone, pin: Pin });
export type LoginBody = z.infer<typeof LoginBody>;

/** Código de recuperación: 8 caracteres sin letras confusas, se muestra como ABCD-EFGH. */
export const RecoveryCode = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, 'El código tiene 8 letras y números (por ejemplo ABCD-EF23)'));

export const ResetPinBody = z.object({ phone: Phone, recoveryCode: RecoveryCode, newPin: Pin });
export const ChangePinBody = z.object({ currentPin: Pin, newPin: Pin });
export const ConfirmPinBody = z.object({ pin: Pin });
export const UpdateMeBody = z.object({ name: Name });

/** Respuesta del registro y de la recuperación: el código nuevo se muestra UNA vez. */
export const AuthResult = z.object({ id: z.string().uuid(), name: z.string(), recoveryCode: z.string().optional() });
export type AuthResult = z.infer<typeof AuthResult>;

export const Me = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** Últimos 3 dígitos del celular (para «Mi cuenta»), nunca el número completo en pantalla ajena. */
  phoneHint: z.string(),
  createdAt: z.string(),
  /** Acceso al panel de administración (ADMIN_PHONES). */
  isAdmin: z.boolean(),
  /** Cuenta de invitado (jurado de NASA Space Apps): puede generar su plan al momento. */
  isGuest: z.boolean(),
  /** Un administrador está «viendo como» esta cuenta demo. */
  actingFor: z.object({ adminName: z.string() }).nullable(),
  communities: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string().nullable(),
    }),
  ),
});
export type Me = z.infer<typeof Me>;

// ───────────────────────── Geometría ─────────────────────────
/** [lon, lat] en WGS84 (orden GeoJSON). */
export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof LonLat>;

/** Anillo exterior de un polígono, sin repetir el primer punto al final. */
export const Ring = z.array(LonLat).min(3, 'Se necesitan al menos 3 puntos').max(500);
export type Ring = z.infer<typeof Ring>;

// ───────────────────────── Comunidad ─────────────────────────
/**
 * Las comunidades ya están guardadas (pueblos y distritos de la sierra de Arequipa). Nadie las crea:
 * cada agricultor busca la suya y se une; la comunidad la forman quienes marcan sus parcelas en ella.
 */
export const CommunitySummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  district: z.string(),
  province: z.string(),
  region: z.string(),
  altitudeM: z.number().int().nullable(),
  memberCount: z.number().int(),
  /** Hay datos NASA del valle procesados para calcular el plan aquí. */
  hasValleyData: z.boolean(),
  isMember: z.boolean(),
});
export type CommunitySummary = z.infer<typeof CommunitySummary>;

/** Vista pública de la comunidad: solo agregados y geometrías; nunca preferencias de nadie. */
export const CommunityView = z.object({
  id: z.string().uuid(),
  slug: z.string().nullable(),
  name: z.string(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  hasValleyData: z.boolean(),
  center: LonLat,
  memberCount: z.number().int(),
  submittedCount: z.number().int(),
  parcels: z.array(
    z.object({
      id: z.string().uuid(),
      ring: Ring,
      areaHa: z.number(),
      mine: z.boolean(),
    }),
  ),
});
export type CommunityView = z.infer<typeof CommunityView>;

// ───────────────────────── Parcela ─────────────────────────
export const WaterSource = z.enum(['none', 'canal', 'spring', 'well', 'reservoir']);
export const WATER_SOURCE_LABEL: Record<z.infer<typeof WaterSource>, string> = {
  none: 'Sin riego (solo lluvia)',
  canal: 'Canal / acequia',
  spring: 'Manantial (puquio)',
  well: 'Pozo',
  reservoir: 'Reservorio / qocha',
};

export const Irrigation = z.object({
  source: WaterSource,
  /** Turnos de riego al mes en temporada seca (0 si no hay). */
  turnsPerMonth: z.number().int().min(0).max(31),
  /** Horas por turno. */
  hoursPerTurn: z.number().min(0).max(48),
});
export type Irrigation = z.infer<typeof Irrigation>;

export const GpsFix = z.object({
  altitudeM: z.number().nullable(),
  accuracyM: z.number().nullable(),
});

export const ParcelBody = z.object({
  communityId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  ring: Ring,
  captureMethod: z.enum(['walk', 'draw']),
  gps: GpsFix.optional(),
  irrigation: Irrigation,
  /** Tres temporadas: [hace 2 campañas, campaña pasada, campaña actual]. */
  currentRotation: z.tuple([SeasonUse, SeasonUse, SeasonUse]),
});
export type ParcelBody = z.infer<typeof ParcelBody>;

export const ParcelPatch = ParcelBody.omit({ communityId: true }).partial();

export const Parcel = ParcelBody.extend({
  id: z.string().uuid(),
  areaHa: z.number(),
  observationCount: z.number().int(),
  createdAt: z.string(),
});
export type Parcel = z.infer<typeof Parcel>;

// ───────────────────────── Estado «datos listos» ─────────────────────────
export const Readiness = z.object({
  hasParcel: z.boolean(),
  rotationsComplete: z.boolean(),
  preferencesSaved: z.boolean(),
  /** Recomendado, no obligatorio. */
  observationTypes: z.array(z.string()),
  canSubmit: z.boolean(),
  submittedAt: z.string().nullable(),
});
export type Readiness = z.infer<typeof Readiness>;
