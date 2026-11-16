import type { DailyClimate, SourceInfo } from '@qullqa/shared';
import { getJson } from './http.ts';

/**
 * NASA POWER, API diaria por punto (comunidad AG). Una sola petición trae 1981→fin.
 * Es reanálisis (MERRA-2 + productos satelitales), no observación directa → provenance 'estimated'.
 */
const PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'WS2M', 'ALLSKY_SFC_SW_DWN', 'PRECTOTCORR', 'GWETROOT'] as const;
type Param = (typeof PARAMS)[number];

interface PowerResponse {
  geometry: { coordinates: [number, number, number] };
  properties: { parameter: Record<Param, Record<string, number>> };
  header: { fill_value: number; api: { version: string }; sources: string[] };
}

export interface PowerResult {
  cell: { lon: number; lat: number; elevationM: number };
  daily: DailyClimate;
  source: SourceInfo;
  warnings: string[];
}

export async function fetchPowerDaily(lonLat: [number, number], start = '19810101', end = '20251231'): Promise<PowerResult> {
  const [lon, lat] = lonLat;
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${PARAMS.join(',')}` +
    `&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;
  const r = await getJson<PowerResponse>(url, { timeoutMs: 300_000 });
  const p = r.properties.parameter;
  const fill = r.header.fill_value;
  const keys = Object.keys(p.T2M_MAX).sort();
  const val = (k: Param, d: string) => {
    const v = p[k]?.[d];
    return v === undefined || v === fill || v <= -990 ? null : v;
  };

  const warnings: string[] = [];
  const daily: DailyClimate = { dates: [], tmax: [], tmin: [], t2m: [], rh: [], wind: [], rad: [], rain: [], gwetroot: [] };
  let gapFilled = 0;
  for (const d of keys) {
    const tmax = val('T2M_MAX', d), tmin = val('T2M_MIN', d);
    if (tmax === null || tmin === null) continue; // día sin temperatura: se omite (el motor tolera huecos)
    const prev = daily.dates.length - 1;
    const rh = val('RH2M', d), wind = val('WS2M', d), rain = val('PRECTOTCORR', d);
    if (rh === null || wind === null || rain === null) gapFilled++;
    daily.dates.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
    daily.tmax.push(tmax);
    daily.tmin.push(tmin);
    daily.t2m.push(val('T2M', d) ?? (tmax + tmin) / 2);
    daily.rh.push(rh ?? daily.rh[prev] ?? 60);
    daily.wind.push(wind ?? daily.wind[prev] ?? 2);
    daily.rad.push(val('ALLSKY_SFC_SW_DWN', d));
    daily.rain.push(rain ?? 0);
    daily.gwetroot.push(val('GWETROOT', d));
  }
  if (gapFilled) warnings.push(`POWER: ${gapFilled} días con humedad/viento/lluvia faltante se rellenaron con el día anterior (lluvia = 0).`);
  const firstRad = daily.dates[daily.rad.findIndex((v) => v !== null)];
  if (firstRad && firstRad > daily.dates[0]!) warnings.push(`POWER no tiene radiación antes de ${firstRad}: esos años usan ET0 de Hargreaves.`);

  const [clon, clat, elev] = r.geometry.coordinates;
  return {
    cell: { lon: clon, lat: clat, elevationM: elev },
    daily,
    warnings,
    source: {
      id: 'power',
      product: `NASA POWER Daily ${r.header.api.version} (${r.header.sources.join(' + ')})`,
      producer: 'NASA Langley Research Center',
      access: 'API POWER (power.larc.nasa.gov)',
      isNasa: true,
      resolution: '0,5° × 0,625° (~55 km), diario',
      coverage: { start: daily.dates[0]!, end: daily.dates.at(-1)! },
      provenance: 'estimated',
      notes: 'Reanálisis, no observación directa. La temperatura se corrige por altitud de la parcela.',
    },
  };
}
