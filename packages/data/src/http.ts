/** fetch con reintentos y timeout. Solo lo usa `packages/data` (el motor nunca toca la red). */
export async function getJson<T>(url: string, opts: { retries?: number; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T> {
  const { retries = 4, timeoutMs = 120_000, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'qullqa-data/0.1', ...headers } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1500 * 2 ** attempt);
    }
  }
  throw new Error(`Falló ${url.split('?')[0]}: ${(lastErr as Error).message}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ejecuta tareas con concurrencia limitada, preservando el orden. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Desplaza un punto [lon, lat] unos metros al este (dx) y al norte (dy). */
export function offsetM([lon, lat]: [number, number], dx: number, dy: number): [number, number] {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  return [lon + dx / mPerDegLon, lat + dy / mPerDegLat];
}
