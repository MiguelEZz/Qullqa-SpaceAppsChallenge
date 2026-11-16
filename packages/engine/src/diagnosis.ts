import type { Assumptions, CropCard } from '@qullqa/catalog';
import type { NdviSeries } from '@qullqa/shared';
import { ELNINO_EVENTS } from './enso.ts';
import type { ParcelClimate } from './climate.ts';
import { type ParcelModel, season } from './parcel.ts';
import { campaignLabel, dayInfo, decadeLabel, kmeans, mannKendall, mean, percentile, round, std } from './util.ts';

/** Rasgos de cada campaña (spec §3.1). Todo 'estimated' (clima POWER corregido a la altitud). */
export interface SeasonProfile {
  year: number;
  label: string;
  /** Día de la campaña (desde 1 jul) en que empiezan las lluvias. */
  rainOnsetDay: number;
  rainOnsetLabel: string;
  totalRain: number;
  /** Racha seca más larga de nov a mar (días < 1 mm). */
  maxDrySpell: number;
  /** Décadas de oct a abr con alguna helada (Tmin ≤ 0 °C ajustada). */
  frostDecades: number;
  /** Heladas tardías (feb–abr), las que dañan la floración. */
  lateFrostDays: number;
  /** Días con Tmax > 25 °C. */
  hotDays: number;
  /** Déficit climático ET0 − lluvia de nov a mar (mm). */
  climaticDeficit: number;
  /** Anomalía z de GWETROOT dic–mar frente a todas las campañas. */
  soilMoistureZ: number | null;
  tminMean: number;
  enso: 'El Niño' | 'La Niña' | null;
}

const inMonths = (m: number, ms: number[]) => ms.includes(m);

export function seasonProfiles(c: ParcelClimate, a: Assumptions): SeasonProfile[] {
  const out: SeasonProfile[] = [];
  const gwByYear: (number | null)[] = [];
  for (const y of c.campaigns) {
    const i0 = c.campaignStart.get(y)!;
    const i1 = (c.campaignStart.get(y + 1) ?? c.days.length) - 1;
    let total = 0, onset = -1, dry = 0, maxDry = 0, hot = 0, deficit = 0, lateFrost = 0, tmin = 0, nT = 0;
    const frostDec = new Set<number>();
    let gw = 0, gwn = 0;
    for (let i = i0; i <= i1; i++) {
      const d = c.days[i]!;
      const r = c.rain[i]!;
      total += r;
      // Inicio de lluvias: desde el 1 de set, 10 días con ≥ 20 mm y que siga lloviendo después (sin falso inicio)
      if (onset < 0 && i - i0 >= 62 && i + 20 <= i1) {
        let r10 = 0, f20 = 0;
        for (let j = i - 9; j <= i; j++) r10 += c.rain[j]!;
        for (let j = i + 1; j <= i + 20; j++) f20 += c.rain[j]!;
        if (r10 >= a.sowing.onsetRain10d_mm && f20 >= a.sowing.onsetFollow20d_mm) onset = i - i0;
      }
      if (inMonths(d.month, [11, 12, 1, 2, 3])) {
        dry = r < a.climate.rainyDay_mm ? dry + 1 : 0;
        maxDry = Math.max(maxDry, dry);
        deficit += c.et0[i]! - r;
      }
      if (inMonths(d.month, [10, 11, 12, 1, 2, 3, 4]) && c.tmin[i]! <= 0) frostDec.add(d.decade);
      if (inMonths(d.month, [2, 3, 4]) && c.tmin[i]! <= -1) lateFrost++;
      if (c.tmax[i]! > 25) hot++;
      tmin += c.tmin[i]!; nT++;
      if (inMonths(d.month, [12, 1, 2, 3])) { const g = c.gwetroot[i]; if (g !== null && g !== undefined) { gw += g; gwn++; } }
    }
    gwByYear.push(gwn ? gw / gwn : null);
    const onsetIdx = onset >= 0 ? i0 + onset : i1;
    out.push({
      year: y, label: campaignLabel(y), rainOnsetDay: onset >= 0 ? onset : i1 - i0,
      rainOnsetLabel: decadeLabel(c.days[onsetIdx]!.decade),
      totalRain: round(total, 0), maxDrySpell: maxDry, frostDecades: frostDec.size, lateFrostDays: lateFrost, hotDays: hot,
      climaticDeficit: round(deficit, 0), soilMoistureZ: null, tminMean: round(tmin / nT, 1),
      enso: ELNINO_EVENTS[y] ?? null,
    });
  }
  const gws = gwByYear.filter((x): x is number => x !== null);
  const m = mean(gws), sd = std(gws);
  out.forEach((p, k) => { const g = gwByYear[k]; p.soilMoistureZ = g !== null && g !== undefined && sd > 0 ? round((g - m) / sd, 2) : null; });
  return out;
}

/** Tendencias (Mann-Kendall + Sen), con frase lista para el agricultor. */
export function trends(profiles: SeasonProfile[]) {
  const n = profiles.length;
  const f = (key: keyof SeasonProfile, label: string, unit: string, per = 10) => {
    const r = mannKendall(profiles.map((p) => p[key] as number));
    const change = r.senSlope * per;
    const significant = r.pValue < 0.05;
    const text = significant
      ? `${label}: ${change > 0 ? 'subió' : 'bajó'} ${Math.abs(round(change, 1))} ${unit} cada ${per} años (tendencia clara, p = ${round(r.pValue, 3)}). Ojo: en un reanálisis una tendencia puede venir de cambios en los datos asimilados; conviene confirmarla con estaciones.`
      : `${label}: sin tendencia clara en ${n} campañas (p = ${round(r.pValue, 2)}).`;
    return { variable: key, ...r, changePerDecade: round(change, 2), significant, text, provenance: 'estimated' as const };
  };
  return [
    f('rainOnsetDay', 'Inicio de lluvias', 'días'),
    f('totalRain', 'Lluvia de la campaña', 'mm'),
    f('maxDrySpell', 'Racha seca más larga (nov–mar)', 'días'),
    f('frostDecades', 'Décadas con helada (oct–abr)', 'décadas'),
    f('tminMean', 'Temperatura mínima media', '°C'),
  ];
}

/** Tipos de año con k-means (spec §3.2c), con nombre según su centroide. */
export function clusterYears(profiles: SeasonProfile[], k: number, seed: number) {
  const keys = ['rainOnsetDay', 'totalRain', 'maxDrySpell', 'frostDecades'] as const;
  const mu = keys.map((key) => mean(profiles.map((p) => p[key])));
  const sd = keys.map((key) => std(profiles.map((p) => p[key])) || 1);
  const rows = profiles.map((p) => keys.map((key, j) => (p[key] - mu[j]!) / sd[j]!));
  const { labels, centroids } = kmeans(rows, k, seed);
  const names = centroids.map((c) => {
    const [onset, rain, drySpell, frost] = c as [number, number, number, number];
    if (rain < -0.5 && (onset > 0.3 || drySpell > 0.3)) return 'Seco y tardío';
    if (frost > 0.5) return 'Frío, con heladas';
    if (rain > 0.5) return 'Lluvioso';
    if (onset > 0.5) return 'Lluvias tardías';
    return 'Normal';
  });
  // Nombres únicos si dos centroides caen en la misma categoría
  const seen = new Map<string, number>();
  const unique = names.map((nm) => { const c = (seen.get(nm) ?? 0) + 1; seen.set(nm, c); return c > 1 ? `${nm} (${c})` : nm; });
  const types = unique.map((name, t) => {
    const members = profiles.filter((_, i) => labels[i] === t);
    return {
      name, count: members.length, years: members.map((m) => m.label),
      elNino: members.filter((m) => m.enso === 'El Niño').length, laNina: members.filter((m) => m.enso === 'La Niña').length,
      meanRain: round(mean(members.map((m) => m.totalRain)), 0), meanOnset: round(mean(members.map((m) => m.rainOnsetDay)), 0),
    };
  });
  return { k, assignments: profiles.map((p, i) => ({ year: p.label, type: unique[labels[i]!]! })), types, provenance: 'estimated' as const };
}

/** Climatología por década del año: mediana, p10, p90 (spec §3.2a). */
export function decadalClimatology(c: ParcelClimate) {
  const rain: number[][] = Array.from({ length: 36 }, () => []), tmin: number[][] = Array.from({ length: 36 }, () => []), et0: number[][] = Array.from({ length: 36 }, () => []);
  let key = '', r = 0, t = 0, e = 0, nd = 0, dec = 0;
  const flush = () => { if (nd) { rain[dec - 1]!.push(r); tmin[dec - 1]!.push(t / nd); et0[dec - 1]!.push(e); } };
  for (let i = 0; i < c.days.length; i++) {
    const d = c.days[i]!;
    const k = `${d.year}-${d.decade}`;
    if (k !== key) { flush(); key = k; r = 0; t = 0; e = 0; nd = 0; dec = d.decade; }
    r += c.rain[i]!; t += c.tmin[i]!; e += c.et0[i]!; nd++;
  }
  flush();
  const q = (xs: number[]) => ({ p10: round(percentile(xs, 0.1), 1), median: round(percentile(xs, 0.5), 1), p90: round(percentile(xs, 0.9), 1) });
  return Array.from({ length: 36 }, (_, d) => ({ decade: d + 1, label: decadeLabel(d + 1), rain_mm: q(rain[d]!), tmin_C: q(tmin[d]!), et0_mm: q(et0[d]!) }));
}

/** Mapa de calor décadas × campañas de un cultivo (spec §3.2d y §11). */
export function stressHeatmap(m: ParcelModel, crop: CropCard) {
  const rows = m.campaigns.map((y) => {
    const s = season(m, crop.id, y, 'descanso');
    // Orden de la campaña: jul (década 19) → jun (década 18)
    const order = Array.from({ length: 36 }, (_, k) => ((k + 18) % 36));
    return {
      campaign: campaignLabel(y),
      cells: order.map((d) => {
        const ratio = s.ratioByDecade[d]!;
        const water = Number.isNaN(ratio) ? null : round(ratio, 2);
        return { decade: d + 1, waterRatio: water, waterStress: water !== null && water < 0.7, frostDays: s.frostByDecade[d]! };
      }),
      yrel: round(s.yrel, 2),
      sowing: s.sowIdx >= 0 ? m.climate.days[s.sowIdx]! : null,
    };
  });
  // Etapas del cultivo sobre el mapa (con la siembra mediana)
  const sowDecades = rows.map((r) => r.sowing?.decade).filter((d): d is number => d !== undefined);
  const medSow = Math.round(percentile(sowDecades, 0.5));
  let at = medSow;
  const stages = crop.stages.map((st) => { const from = at; at += st.duration_decades; return { name: st.name, fromDecade: ((from - 1) % 36) + 1, toDecade: ((at - 2) % 36) + 1 }; });
  return {
    crop: crop.id, columns: Array.from({ length: 36 }, (_, k) => decadeLabel(((k + 18) % 36) + 1)),
    rows: rows.map((r) => ({ campaign: r.campaign, cells: r.cells, yrel: r.yrel })),
    stages, rule: 'Estrés hídrico: ETa/ETc < 0,7 en la década. Helada: Tmin ajustada bajo el límite de la etapa.', provenance: 'simulated' as const,
  };
}

/** Fenología desde NDVI MODIS (spec §1.4): inicio, pico y fin por campaña, y periodos de suelo desnudo. */
export function phenology(ndvi: NdviSeries) {
  const byCampaign = new Map<number, { doy: number; v: number; date: string }[]>();
  ndvi.dates.forEach((date, i) => {
    const v = ndvi.ndvi[i];
    if (v === null || v === undefined) return;
    const d = dayInfo(date);
    const y = d.month >= 7 ? d.year : d.year - 1;
    if (!byCampaign.has(y)) byCampaign.set(y, []);
    byCampaign.get(y)!.push({ doy: d.doy, v, date });
  });
  const all = ndvi.ndvi.filter((x): x is number => x !== null);
  const bareThreshold = percentile(all, 0.15);
  const seasons = [...byCampaign.entries()].filter(([, pts]) => pts.length >= 12).map(([y, pts]) => {
    const vmin = Math.min(...pts.map((p) => p.v)), vmax = Math.max(...pts.map((p) => p.v));
    const amp = vmax - vmin;
    const peak = pts.find((p) => p.v === vmax)!;
    const pi = pts.indexOf(peak);
    const greenUp = pts.slice(0, pi + 1).find((p) => p.v >= vmin + 0.2 * amp) ?? pts[0]!;
    const senescence = [...pts.slice(pi)].reverse().find((p) => p.v >= vmin + 0.5 * amp) ?? pts.at(-1)!;
    const bare = pts.filter((p) => p.v <= bareThreshold).map((p) => p.date);
    return { campaign: campaignLabel(y), greenUp: greenUp.date, peak: peak.date, peakNdvi: round(vmax, 3), senescence: senescence.date, bareDates: bare };
  });
  const goodFraction = ndvi.quality.filter((q) => q === 'good').length / Math.max(1, ndvi.quality.length);
  return { seasons, bareThreshold: round(bareThreshold, 3), goodFraction: round(goodFraction, 2), source: ndvi.source, provenance: 'estimated' as const };
}

/** z = (valor − media de esa década) / desviación (spec §1.3). */
export function ndviAnomaly(value: number, historicalMean: number, historicalStd: number): number {
  return historicalStd > 0 ? (value - historicalMean) / historicalStd : 0;
}
