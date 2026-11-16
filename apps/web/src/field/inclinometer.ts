/**
 * Inclinómetro y brújula con los sensores del celular (spec sec. 5, ítem 4).
 * Uso: el celular apoyado sobre el suelo (o una tabla) con la parte de ARRIBA apuntando LADERA ABAJO.
 * - Pendiente: ángulo entre la pantalla y el plano horizontal.
 * - Orientación: rumbo de brújula hacia donde apunta la parte de arriba del celular.
 */

export type Reading = { slopeDeg: number; headingDeg: number | null };

type IOSOrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export async function requestSensorPermission(): Promise<boolean> {
  const E = window.DeviceOrientationEvent as IOSOrientationEvent | undefined;
  if (!E) return false;
  if (typeof E.requestPermission === 'function') {
    try {
      return (await E.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/** Se suscribe a las lecturas; devuelve la función para cancelar. */
export function watchOrientation(onReading: (r: Reading) => void): () => void {
  const toRad = Math.PI / 180;
  const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    if (e.beta == null || e.gamma == null) return;
    const slope = Math.acos(Math.cos(e.beta * toRad) * Math.cos(e.gamma * toRad)) / toRad;
    let heading: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading; // iOS
    else if (e.absolute && e.alpha != null) heading = (360 - e.alpha) % 360; // Android
    onReading({ slopeDeg: Math.min(80, slope), headingDeg: heading });
  };
  const absEvent = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(absEvent, handler as EventListener);
  return () => window.removeEventListener(absEvent, handler as EventListener);
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function compassLabel(deg: number): string {
  return DIRS[Math.round(deg / 45) % 8]!;
}
