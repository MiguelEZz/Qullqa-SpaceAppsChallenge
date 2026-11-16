import { api } from '../api.ts';

/** ¿Este navegador puede recibir notificaciones del celular? (en iPhone, solo con la app instalada) */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Pide permiso y suscribe este celular a los avisos. Devuelve un texto para mostrar si no se pudo. */
export async function enablePush(): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported()) return { ok: false, message: 'Este navegador no puede recibir avisos. En iPhone, primero instala Qullqa en tu pantalla de inicio.' };
  const { key } = await api<{ key: string }>('/push/key');
  if (!key) return { ok: false, message: 'Los avisos del celular todavía no están activos en el servidor.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, message: 'No diste permiso. Puedes activarlo en los ajustes del navegador, en «Notificaciones».' };
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/push/subscribe', { method: 'POST', json: { endpoint: json.endpoint, keys: json.keys } });
  return { ok: true };
}
