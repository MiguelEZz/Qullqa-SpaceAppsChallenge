import type { LonLat } from '@qullqa/shared';

export type Fix = { lon: number; lat: number; altitude: number | null; accuracy: number };

export function getFix(timeout = 20000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este teléfono no tiene GPS disponible'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lon: p.coords.longitude, lat: p.coords.latitude, altitude: p.coords.altitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(gpsError(e))),
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    );
  });
}

export function gpsError(e: GeolocationPositionError): string {
  if (e.code === e.PERMISSION_DENIED) return 'Necesitamos permiso de ubicación. Actívalo en los ajustes del navegador.';
  if (e.code === e.TIMEOUT) return 'El GPS tardó mucho. Sal a cielo abierto e intenta de nuevo.';
  return 'No se pudo obtener la ubicación.';
}

/** Distancia en metros (haversine). */
export function distanceM(a: LonLat, b: LonLat): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad, dLon = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Área aproximada en m² (proyección local equirectangular), para mostrar mientras se traza. */
export function areaM2(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const mx = 111320 * Math.cos(lat0), my = 110540;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    s += p[0] * mx * (q[1] * my) - q[0] * mx * (p[1] * my);
  }
  return Math.abs(s) / 2;
}

/** Reduce un recorrido largo a ≤ max puntos conservando la forma general. */
export function thin(ring: LonLat[], max = 300): LonLat[] {
  if (ring.length <= max) return ring;
  const step = ring.length / max;
  return Array.from({ length: max }, (_, i) => ring[Math.floor(i * step)]!);
}

export function formatArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2)} m²`;
}

export type Sample = { lon: number; lat: number; accuracy: number; altitude: number | null };

/**
 * Promedio ponderado de varias lecturas del GPS (peso 1/precisión²): en una esquina, quieto, 4–6 lecturas
 * reducen mucho el error de una sola. Devuelve el punto y una precisión estimada.
 */
export function averageSamples(samples: Sample[]): { point: LonLat; accuracy: number; altitude: number | null } | null {
  if (!samples.length) return null;
  const best = Math.min(...samples.map((s) => s.accuracy));
  // Descarta lecturas mucho peores que la mejor (saltos del GPS)
  const use = samples.filter((s) => s.accuracy <= Math.max(best * 2, best + 5));
  let wx = 0, wy = 0, w = 0, wa = 0, alt = 0, nAlt = 0;
  for (const s of use) {
    const k = 1 / Math.max(1, s.accuracy) ** 2;
    wx += s.lon * k; wy += s.lat * k; w += k; wa += k * s.accuracy;
    if (s.altitude != null) { alt += s.altitude; nAlt++; }
  }
  const acc = wa / w / Math.sqrt(use.length);
  return { point: [wx / w, wy / w], accuracy: Math.max(1, acc), altitude: nAlt ? alt / nAlt : null };
}

/** Mantiene la pantalla encendida (si el navegador lo permite): con la pantalla apagada el GPS se detiene. */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const lock = await nav.wakeLock?.request('screen');
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}
