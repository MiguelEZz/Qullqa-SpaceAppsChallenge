/**
 * Cliente de la API. Siempre rutas relativas (/api/...): la app y la API comparten origen.
 * El header evita la página de advertencia de ngrok gratis en las llamadas fetch.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'include',
      headers: {
        'ngrok-skip-browser-warning': '1',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...rest.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Sin conexión. Revisa tu señal e intenta de nuevo.');
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}
