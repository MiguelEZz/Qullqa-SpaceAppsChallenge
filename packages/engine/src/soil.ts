import type { SoilProfile } from '@qullqa/shared';

export interface SoilHydraulics {
  /** Contenido de agua a capacidad de campo y marchitez (m³/m³). */
  thetaFC: number;
  thetaWP: number;
  /** Agua total disponible por metro de suelo (mm/m). */
  tawPerM: number;
}

/** Pedotransferencia de Saxton & Rawls (2006), ecuaciones 1–2. Arena/arcilla en %, MO en %. */
export function saxtonRawls(sandPct: number, clayPct: number, omPct: number): SoilHydraulics {
  const S = sandPct / 100, C = clayPct / 100, OM = Math.min(8, Math.max(0, omPct));
  const t1500t = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * S * OM - 0.013 * C * OM + 0.068 * S * C + 0.031;
  const thetaWP = t1500t + (0.14 * t1500t - 0.02);
  const t33t = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * S * OM - 0.027 * C * OM + 0.452 * S * C + 0.299;
  const thetaFC = t33t + (1.283 * t33t * t33t - 0.374 * t33t - 0.015);
  return { thetaFC, thetaWP, tawPerM: Math.max(30, 1000 * (thetaFC - thetaWP)) };
}

/** Factor K de RUSLE (EPIC, Sharpley & Williams 1990), en t·ha·h/(ha·MJ·mm). */
export function erodibilityK(soil: SoilProfile): number {
  const SAN = soil.sandPct, SIL = soil.siltPct, CLA = soil.clayPct, C = soil.socPct;
  const fcsand = 0.2 + 0.3 * Math.exp(-0.256 * SAN * (1 - SIL / 100));
  const fclsi = (SIL / Math.max(1e-6, CLA + SIL)) ** 0.3;
  const forgc = 1 - (0.25 * C) / (C + Math.exp(3.72 - 2.95 * C));
  const SN1 = 1 - SAN / 100;
  const fhisand = 1 - (0.7 * SN1) / (SN1 + Math.exp(-5.51 + 22.9 * SN1));
  return fcsand * fclsi * forgc * fhisand * 0.1317;
}

/** Factor LS (McCool et al.): pendiente en grados, longitud de ladera en m. */
export function lsFactor(slopeDeg: number, lengthM: number): number {
  const th = (slopeDeg * Math.PI) / 180;
  const pct = Math.tan(th) * 100;
  const m = pct >= 5 ? 0.5 : pct >= 3.5 ? 0.4 : pct >= 1 ? 0.3 : 0.2;
  const L = (lengthM / 22.13) ** m;
  const S = pct < 9 ? 10.8 * Math.sin(th) + 0.03 : 16.8 * Math.sin(th) - 0.5;
  return Math.max(0, L * S);
}

/** Erosividad anual R (Renard & Freimund 1994), MJ·mm/(ha·h·año), con lluvia anual en mm. */
export function erosivityR(annualRain_mm: number): number {
  return annualRain_mm < 850 ? 0.0483 * annualRain_mm ** 1.61 : 587.8 - 1.219 * annualRain_mm + 0.004105 * annualRain_mm ** 2;
}
