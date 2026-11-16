import { z } from 'zod';

/**
 * Cultivos de sierra (piloto Colca, Arequipa). Solo identidad y familia:
 * los parámetros agronómicos (Kc, Ky, heladas, GDD, precios) viven en packages/catalog
 * con su fuente citada, y los usa el motor.
 */
export const CROPS = [
  { id: 'papa', name: 'Papa', family: 'Solanaceae' },
  { id: 'olluco', name: 'Olluco', family: 'Basellaceae' },
  { id: 'oca', name: 'Oca', family: 'Oxalidaceae' },
  { id: 'haba', name: 'Haba', family: 'Fabaceae' },
  { id: 'tarwi', name: 'Tarwi', family: 'Fabaceae' },
  { id: 'arveja', name: 'Arveja', family: 'Fabaceae' },
  { id: 'quinua', name: 'Quinua', family: 'Amaranthaceae' },
  { id: 'cebada', name: 'Cebada', family: 'Poaceae' },
  { id: 'avena_forrajera', name: 'Avena forrajera', family: 'Poaceae' },
  { id: 'maiz_amilaceo', name: 'Maíz amiláceo (Cabanita)', family: 'Poaceae' },
] as const;

export const CROP_IDS = CROPS.map((c) => c.id) as [CropId, ...CropId[]];
export type CropId = (typeof CROPS)[number]['id'];

/** Además de cultivos, una temporada puede haber quedado en descanso. */
export const SEASON_OPTIONS = ['descanso', ...CROP_IDS] as const;
export const SeasonUse = z.enum(SEASON_OPTIONS);
export type SeasonUse = z.infer<typeof SeasonUse>;

export const CropIdSchema = z.enum(CROP_IDS);

export function cropName(id: string): string {
  if (id === 'descanso') return 'Descanso (sin sembrar)';
  return CROPS.find((c) => c.id === id)?.name ?? id;
}
