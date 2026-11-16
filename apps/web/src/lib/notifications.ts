import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';

export interface NotificationItem { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }

/** Avisos del agricultor; se revisan cada minuto mientras la app está abierta. */
export function useNotifications(enabled: boolean) {
  const [data, setData] = useState<{ unread: number; items: NotificationItem[] }>({ unread: 0, items: [] });
  const reload = useCallback(async () => {
    if (!enabled) return;
    try { setData(await api('/notifications')); } catch { /* sin conexión: se reintenta */ }
  }, [enabled]);
  useEffect(() => {
    void reload();
    if (!enabled) return;
    const t = setInterval(() => void reload(), 60_000);
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [enabled, reload]);
  const markRead = useCallback(async () => {
    await api('/notifications/read', { method: 'POST' }).catch(() => {});
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
  }, []);
  return { ...data, reload, markRead };
}
