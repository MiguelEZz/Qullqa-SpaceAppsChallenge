/** Utilidades puras: PRNG con semilla, calendario y estadística. Nada de Date.now() ni Math.random(). */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────── Calendario ─────────────
export interface DayInfo { year: number; month: number; day: number; doy: number; decade: number }

/** Parsea 'YYYY-MM-DD' sin depender de la zona horaria. */
export function dayInfo(date: string): DayInfo {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10));
  const doy = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return { year, month, day, doy, decade: (month - 1) * 3 + (day <= 10 ? 1 : day <= 20 ? 2 : 3) };
}

/** Campaña agrícola: 1 jul del año Y → 30 jun de Y+1. */
export const campaignOf = (d: DayInfo) => (d.month >= 7 ? d.year : d.year - 1);
export const campaignLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

/** Fecha legible: «12 oct». */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
export const shortDate = (d: DayInfo) => `${d.day} ${MONTHS[d.month - 1]}`;
export const decadeLabel = (dec: number) => `${['1–10', '11–20', '21–fin'][(dec - 1) % 3]} ${MONTHS[Math.floor((dec - 1) / 3)]}`;

// ───────────── Estadística ─────────────
export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

/** Percentil con interpolación lineal (q en 0–1). */
export function percentile(a: number[], q: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Prueba de Mann-Kendall + pendiente de Sen (por paso de la serie). Sin corrección por empates. */
export function mannKendall(series: number[]): { trend: -1 | 0 | 1; pValue: number; senSlope: number; s: number } {
  const n = series.length;
  if (n < 4) return { trend: 0, pValue: 1, senSlope: 0, s: 0 };
  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(series[j]! - series[i]!);
      slopes.push((series[j]! - series[i]!) / (j - i));
    }
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(varS) : s < 0 ? (s + 1) / Math.sqrt(varS) : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { trend: pValue < 0.05 ? (s > 0 ? 1 : -1) : 0, pValue, senSlope: percentile(slopes, 0.5), s };
}

export function normalCdf(z: number): number {
  // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** k-means con semilla (k-means++), sobre filas ya estandarizadas. */
export function kmeans(rows: number[][], k: number, seed: number, iters = 100): { labels: number[]; centroids: number[][] } {
  const rnd = mulberry32(seed);
  const d2 = (a: number[], b: number[]) => sum(a.map((x, i) => (x - b[i]!) ** 2));
  const centroids: number[][] = [rows[Math.floor(rnd() * rows.length)]!.slice()];
  while (centroids.length < k) {
    const dist = rows.map((r) => Math.min(...centroids.map((c) => d2(r, c))));
    let target = rnd() * sum(dist);
    let idx = 0;
    for (; idx < rows.length - 1 && target > dist[idx]!; idx++) target -= dist[idx]!;
    centroids.push(rows[idx]!.slice());
  }
  let labels = rows.map(() => 0);
  for (let it = 0; it < iters; it++) {
    const next = rows.map((r) => {
      let best = 0;
      for (let c = 1; c < k; c++) if (d2(r, centroids[c]!) < d2(r, centroids[best]!)) best = c;
      return best;
    });
    for (let c = 0; c < k; c++) {
      const members = rows.filter((_, i) => next[i] === c);
      if (members.length) centroids[c] = members[0]!.map((_, j) => mean(members.map((m) => m[j]!)));
    }
    if (next.every((l, i) => l === labels[i])) { labels = next; break; }
    labels = next;
  }
  return { labels, centroids };
}

export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
