/**
 * Gráficos SVG sencillos para el panel (sin dependencias). Reglas: marcas finas, un solo eje, colores por
 * entidad (no por rango), texto en tintas de texto, <title> como tooltip en cada marca, leyenda si hay ≥ 2 series.
 */
import type { ReactNode } from 'react';

const fmt = (n: number, d = 0) => n.toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Grupos de cultivo para colorear (paleta validada para daltonismo, claro y oscuro). */
export const CROP_GROUPS = [
  { id: 'tuber', label: 'Tubérculos (papa, oca, olluco)', color: '#b64a31', crops: ['papa', 'oca', 'olluco'] },
  { id: 'legume', label: 'Leguminosas (haba, tarwi, arveja)', color: '#3a7fc0', crops: ['haba', 'tarwi', 'arveja'] },
  { id: 'cereal', label: 'Cereales y forraje (cebada, avena, maíz)', color: '#b8860b', crops: ['cebada', 'avena_forrajera', 'maiz_amilaceo'] },
  { id: 'quinoa', label: 'Quinua', color: '#8a5cb5', crops: ['quinua'] },
  { id: 'fallow', label: 'Descanso', color: '#8c857d', crops: ['descanso'] },
] as const;
export const groupOf = (crop: string) => CROP_GROUPS.find((g) => (g.crops as readonly string[]).includes(crop)) ?? CROP_GROUPS[4];

export function Legend({ items }: { items: { label: string; color: string; pattern?: boolean }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}><span className={`swatch ${i.pattern ? 'hatch' : ''}`} style={{ background: i.pattern ? undefined : i.color, borderColor: i.color }} />{i.label}</li>
      ))}
    </ul>
  );
}

/** Barras horizontales con etiqueta y valor (una serie). */
export function BarList({ rows, unit = '', color = 'var(--brick)', digits = 0, wrap = false }: { rows: { label: ReactNode; value: number; hint?: string; color?: string }[]; unit?: string; color?: string; digits?: number; wrap?: boolean }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul className={`barlist ${wrap ? 'wrap' : ''}`}>
      {rows.map((r, i) => (
        <li key={i} title={r.hint ?? `${typeof r.label === 'string' ? r.label : ''}: ${fmt(r.value, digits)} ${unit}`}>
          <span className="bl-label">{r.label}</span>
          <span className="bl-track"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></span>
          <span className="bl-value">{fmt(r.value, digits)}{unit && ` ${unit}`}</span>
        </li>
      ))}
    </ul>
  );
}

/** Columnas verticales en el tiempo (una serie); `mark` resalta algunas columnas con trama (p. ej. El Niño). */
export function Columns({ data, unit, color = 'var(--brick)', height = 150, labelEvery = 1, refLine }: {
  data: { label: string; value: number; mark?: boolean; hint?: string }[]; unit: string; color?: string; height?: number; labelEvery?: number; refLine?: { value: number; label: string };
}) {
  const W = 360, H = height, pad = { l: 34, r: 6, t: 8, b: 22 };
  const max = Math.max(1e-9, ...data.map((d) => d.value), refLine?.value ?? 0) * 1.08;
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [...new Set([0, max / 2, max].map((v) => Math.round(v)))];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de columnas en ${unit}`}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={color} /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--paper)" strokeWidth="2.5" />
        </pattern>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" /><text x={pad.l - 4} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t)}</text></g>
      ))}
      {refLine && <g><line x1={pad.l} x2={W - pad.r} y1={y(refLine.value)} y2={y(refLine.value)} className="ref" /><text x={W - pad.r} y={y(refLine.value) - 4} textAnchor="end" className="axis">{refLine.label}</text></g>}
      {data.map((d, i) => {
        const h = Math.max(0, y(0) - y(d.value));
        return (
          <g key={d.label}>
            <rect x={pad.l + i * bw + 1} y={y(d.value)} width={Math.max(1, bw - 2)} height={h} rx={Math.min(3, bw / 4)} fill={d.mark ? 'url(#hatch)' : color}>
              <title>{d.hint ?? `${d.label}: ${fmt(d.value)} ${unit}`}</title>
            </rect>
            {i % labelEvery === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Línea con banda opcional (p10–p90). Un eje. */
export function LineChart({ points, unit, color = 'var(--green)', height = 160, xLabels, band }: {
  points: number[]; unit: string; color?: string; height?: number; xLabels: string[]; band?: [number, number][];
}) {
  const W = 360, H = height, pad = { l: 34, r: 8, t: 10, b: 22 };
  const all = [...points, ...(band?.flat() ?? [])];
  const lo = Math.min(0, ...all), hi = Math.max(...all) * 1.08 || 1;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = band ? `${band.map(([a], i) => `${i ? 'L' : 'M'}${x(i)},${y(a)}`).join('')}${band.map(([, b], i) => `L${x(band.length - 1 - i)},${y(band[band.length - 1 - i]![1])}`).join('')}Z` : '';
  const every = Math.ceil(points.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico de línea en ${unit}`}>
      {[lo, (lo + hi) / 2, hi].map((t, i) => (
        <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" /><text x={pad.l - 4} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t, hi < 5 ? 1 : 0)}</text></g>
      ))}
      {band && <path d={area} fill={color} opacity={0.15} />}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={8} fill="transparent"><title>{`${xLabels[i]}: ${fmt(v, 2)} ${unit}${band ? ` (rango ${fmt(band[i]![0], 1)}–${fmt(band[i]![1], 1)})` : ''}`}</title></circle>
          {i % every === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{xLabels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Barras apiladas al 100 % (mezcla de cultivos por campaña), con leyenda y separación de 2 px. */
export function StackedRows({ rows }: { rows: { label: string; parts: { key: string; value: number; color: string; name: string }[] }[] }) {
  return (
    <ul className="stacked">
      {rows.map((r) => {
        const tot = r.parts.reduce((s, p) => s + p.value, 0) || 1;
        return (
          <li key={r.label}>
            <span className="bl-label">{r.label}</span>
            <span className="st-track">
              {r.parts.filter((p) => p.value > 0).map((p) => (
                <span key={p.key} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }} title={`${p.name}: ${fmt(p.value, 2)} ha (${Math.round((p.value / tot) * 100)} %)`} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** Embudo: cada paso como % del primero, con la caída respecto al anterior. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ul className="barlist funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1]!.value : s.value;
        const drop = i && prev > 0 ? Math.round((1 - s.value / prev) * 100) : 0;
        return (
          <li key={s.label} title={`${s.label}: ${s.value} (${Math.round((s.value / top) * 100)} % del total)`}>
            <span className="bl-label">{s.label}</span>
            <span className="bl-track"><span style={{ width: `${(s.value / top) * 100}%`, background: 'var(--green)' }} /></span>
            <span className="bl-value">{s.value}{drop > 0 ? <small className="drop"> −{drop} %</small> : null}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Escala secuencial de riesgo (un solo tono, claro → oscuro) con cortes fijos por indicador. */
export const RISK_STEPS = ['#f1d9cf', '#e0a089', '#c4613f', '#7d2f1c'];
export const RISK_METRICS = {
  lossProb: { label: 'Perder la cosecha', unit: '% de campañas', cuts: [0.05, 0.15, 0.3], fmt: (v: number) => `${Math.round(v * 100)} %` },
  deficitMm: { label: 'Falta de agua', unit: 'mm por campaña', cuts: [40, 80, 150], fmt: (v: number) => `${Math.round(v)} mm` },
  erosionTha: { label: 'Erosión', unit: 't/ha/año', cuts: [1, 3, 8], fmt: (v: number) => `${v.toFixed(1)} t/ha` },
} as const;
export type RiskMetric = keyof typeof RISK_METRICS;
export const riskColor = (m: RiskMetric, v: number) => RISK_STEPS[RISK_METRICS[m].cuts.filter((c) => v >= c).length]!;
export const riskLegend = (m: RiskMetric) => {
  const { cuts, fmt } = RISK_METRICS[m];
  return [`menos de ${fmt(cuts[0])}`, `${fmt(cuts[0])}–${fmt(cuts[1])}`, `${fmt(cuts[1])}–${fmt(cuts[2])}`, `más de ${fmt(cuts[2])}`].map((label, i) => ({ label, color: RISK_STEPS[i]! }));
};
