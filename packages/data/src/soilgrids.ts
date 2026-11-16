import type { SoilProfile, SourceInfo } from '@qullqa/shared';
import { getJson } from './http.ts';

/** SoilGrids 2.0 (ISRIC) por punto: promedio ponderado 0–30 cm. Producto de un modelo → 'estimated'. */
export const SOILGRIDS_SOURCE: SourceInfo = {
  id: 'soilgrids',
  product: 'SoilGrids 2.0 (media, 0–30 cm)',
  producer: 'ISRIC — World Soil Information',
  access: 'API REST rest.isric.org',
  isNasa: false,
  resolution: '250 m, estático',
  coverage: null,
  provenance: 'estimated',
  notes: 'Estimación espacial por aprendizaje automático, no una medición en la parcela. No es serie temporal.',
};

const PROPS = ['clay', 'sand', 'silt', 'soc', 'phh2o', 'bdod'] as const;
const DEPTHS = [['0-5cm', 5], ['5-15cm', 10], ['15-30cm', 15]] as const;

interface SgResp {
  properties: { layers: { name: string; unit_measure: { d_factor: number }; depths: { label: string; values: { mean: number | null } }[] }[] };
}

export async function fetchSoil([lon, lat]: [number, number]): Promise<SoilProfile> {
  const q = PROPS.map((p) => `property=${p}`).join('&') + '&' + DEPTHS.map(([d]) => `depth=${d}`).join('&');
  const r = await getJson<SgResp>(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&${q}&value=mean`, { retries: 5 });
  const avg = (name: string): number => {
    const layer = r.properties.layers.find((l) => l.name === name);
    if (!layer) throw new Error(`SoilGrids sin ${name}`);
    let sum = 0, w = 0;
    for (const [label, thick] of DEPTHS) {
      const v = layer.depths.find((d) => d.label === label)?.values.mean;
      if (v !== null && v !== undefined) { sum += (v / layer.unit_measure.d_factor) * thick; w += thick; }
    }
    if (!w) throw new Error(`SoilGrids sin datos de ${name} en este punto`);
    return sum / w;
  };
  // Unidades tras d_factor: clay/sand/silt %, soc g/kg, phh2o pH, bdod kg/dm³ (= g/cm³)
  const socPct = avg('soc') / 10;
  const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    clayPct: round(avg('clay'), 1),
    sandPct: round(avg('sand'), 1),
    siltPct: round(avg('silt'), 1),
    socPct: round(socPct),
    omPct: round(socPct * 1.724),
    ph: round(avg('phh2o'), 1),
    bulkDensity_gcm3: round(avg('bdod')),
    source: SOILGRIDS_SOURCE.product,
  };
}
