import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';

/** GET sencillo con recarga manual. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Guarda el evento de instalación aunque llegue antes de montar React. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const early = window as Window & { __qullqaInstall?: InstallEvent | null };
let deferred: InstallEvent | null = early.__qullqaInstall ?? null;
const listeners = new Set<() => void>();
// index.html captura el evento lo antes posible; aquí solo lo recogemos
window.addEventListener('qullqa-installable', () => {
  deferred = early.__qullqaInstall ?? null;
  listeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  early.__qullqaInstall = null;
  listeners.forEach((l) => l());
});

/** Qué celular/navegador es, para dar las instrucciones correctas de instalación. */
export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  // Abierto desde otra app (WhatsApp, Facebook…): en Android suele ser una «Custom Tab» de Chrome con el mismo
  // userAgent, pero el referrer es android-app://<paquete>. Ahí no se puede instalar. index.html lo recuerda.
  let fromApp: string | null = null;
  try { fromApp = sessionStorage.getItem('qullqa-from-app'); } catch { /* sin almacenamiento */ }
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|; wv\)/i.test(ua) || !!fromApp;
  const iosSafari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua) && !inApp;
  const samsung = /SamsungBrowser/i.test(ua);
  const miui = /MiuiBrowser|XiaoMi/i.test(ua);
  const huawei = /HuaweiBrowser/i.test(ua);
  const firefox = /Firefox|FxiOS/i.test(ua);
  const opera = /OPR\/|Opera/i.test(ua);
  const brave = !!(navigator as { brave?: unknown }).brave;
  const chrome = android && /Chrome\//.test(ua) && !samsung && !miui && !huawei && !opera && !brave && !/EdgA/.test(ua);
  const appName = fromApp?.includes('whatsapp') ? 'WhatsApp' : fromApp?.includes('facebook') ? 'Facebook' : fromApp ? 'otra app' : null;
  return { ios, android, inApp, appName, iosSafari, samsung, miui, huawei, firefox, opera, brave, chrome, mobile: ios || android };
}

/** ¿Ya está instalada? (Chrome Android, vía related_applications del manifiesto). */
let installedCache: boolean | null = null;
async function checkInstalled(): Promise<boolean> {
  if (installedCache !== null) return installedCache;
  const nav = navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> };
  try { installedCache = nav.getInstalledRelatedApps ? (await nav.getInstalledRelatedApps()).length > 0 : false; } catch { installedCache = false; }
  return installedCache;
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  const [installed, setInstalled] = useState(installedCache ?? false);
  // Chrome a veces avisa que se puede instalar unos segundos después de cargar: esperamos antes de mostrar pasos manuales
  const [waited, setWaited] = useState(performance.now() > 4000);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void checkInstalled().then(setInstalled);
    const t = setTimeout(() => setWaited(true), Math.max(0, 4000 - performance.now()));
    return () => { listeners.delete(l); clearTimeout(t); };
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return {
    canInstall: !!deferred && !standalone,
    standalone,
    installed,
    waited: waited || !!deferred,
    install: async () => {
      if (!deferred) return false;
      const ev = deferred;
      deferred = null;
      early.__qullqaInstall = null;
      await ev.prompt();
      const choice = await ev.userChoice.catch(() => ({ outcome: 'dismissed' }));
      force((n) => n + 1);
      return choice.outcome === 'accepted';
    },
  };
}
