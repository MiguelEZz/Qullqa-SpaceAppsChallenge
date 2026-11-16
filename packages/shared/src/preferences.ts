import { z } from 'zod';
import { CropIdSchema, type CropId } from './crops.ts';

/** Los 8 indicadores del motor (spec sec. 7). */
export const INDICATORS = [
  { id: 'water', label: 'Agua', hint: 'Usar menos agua y sufrir menos por sequía' },
  { id: 'climateRisk', label: 'Clima adverso', hint: 'Perder menos cosechas por helada o sequía' },
  { id: 'organicMatter', label: 'Materia orgánica', hint: 'Un suelo más negro y vivo' },
  { id: 'nitrogen', label: 'Nitrógeno', hint: 'Abonar el suelo con leguminosas' },
  { id: 'erosion', label: 'Erosión', hint: 'No perder tierra en las laderas' },
  { id: 'pestHealth', label: 'Sanidad', hint: 'Menos plagas y enfermedades' },
  { id: 'income', label: 'Ingreso', hint: 'Ganar más dinero con la cosecha' },
  { id: 'forage', label: 'Forraje', hint: 'Alimento para el ganado' },
] as const;

export type IndicatorId = (typeof INDICATORS)[number]['id'];
const IndicatorIds = INDICATORS.map((i) => i.id) as [IndicatorId, ...IndicatorId[]];
export const IndicatorId = z.enum(IndicatorIds);

/** 10 monedas repartidas entre los 8 indicadores (privado). */
export const Coins = z
  .record(IndicatorId, z.number().int().min(0).max(10))
  .refine((c) => IndicatorIds.every((k) => k in c), 'Faltan indicadores')
  .refine((c) => Object.values(c).reduce((a, b) => a + b, 0) === 10, 'Reparte exactamente 10 monedas');
export type Coins = z.infer<typeof Coins>;

export const Constraints = z.object({
  /** Tracción disponible para preparar el suelo. */
  traction: z.enum(['manual', 'yunta', 'tractor']),
  /** Personas de la familia que trabajan la chacra. */
  familyWorkers: z.number().int().min(0).max(30),
  /** ¿Puede contratar peones o hacer ayni/mink'a? */
  canGetExtraLabor: z.boolean(),
  /** Destino principal de la cosecha. */
  market: z.enum(['autoconsumo', 'feria_local', 'intermediario', 'mixto']),
  /** Cuántos animales tiene que alimentar (afecta el valor del forraje). */
  livestockHeads: z.number().int().min(0).max(1000),
});
export type Constraints = z.infer<typeof Constraints>;

/** «¿Qué te importa más?»: 1–2 tarjetas en palabras del agricultor. `icon` es el nombre de un ícono SVG de la app (sin emojis). */
export const FOCUS_CARDS = [
  { id: 'money', icon: 'coin', label: 'Ganar más dinero', hint: 'Vender bien mi cosecha' },
  { id: 'safeHarvest', icon: 'snow', label: 'No perder mi cosecha', hint: 'Que la helada, la sequía o la plaga no me la quiten' },
  { id: 'goodLand', icon: 'leaf', label: 'Que mi tierra siga buena', hint: 'Que no se lave con la lluvia y siga dando para mis hijos' },
  { id: 'animals', icon: 'cow', label: 'Comida para mis animales', hint: 'Pasto y forraje para el ganado' },
] as const;
export const FocusId = z.enum(['money', 'safeHarvest', 'goodLand', 'animals']);
export type FocusId = z.infer<typeof FocusId>;

export const PreferencesBody = z.object({
  /** Tarjetas elegidas (en orden). Si viene, el servidor calcula las monedas. */
  focus: z.array(FocusId).min(1, 'Elige al menos una').max(2, 'Elige como máximo dos').refine((f) => new Set(f).size === f.length, 'Repetida').optional(),
  /** Monedas puestas a mano («Ajustar en detalle»). Si vienen, mandan sobre las tarjetas. */
  coins: Coins.optional(),
  constraints: Constraints,
  /** Cultivos que NO quiere sembrar. */
  vetoes: z.array(CropIdSchema).max(10),
}).refine((b) => b.focus || b.coins, 'Elige lo que más te importa');
export type PreferencesBody = z.infer<typeof PreferencesBody>;

/** Lo que devuelve la API: siempre trae las monedas efectivas y de dónde salen. */
export type PreferencesView = { focus: FocusId[]; coins: Coins; coinsSource: 'cards' | 'manual'; constraints: Constraints; vetoes: CropId[] };
