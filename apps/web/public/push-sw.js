/* Notificaciones del celular (Web Push). Se carga dentro del service worker de la app (vite.config.ts → importScripts). */
self.addEventListener('push', (event) => {
  let data = { title: 'Qullqa', body: 'Tienes un aviso nuevo.', url: '/avisos' };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* aviso sin datos */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icon-192.png', badge: '/favicon.png', data: { url: data.url }, lang: 'es',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return; } }
    await self.clients.openWindow(url);
  })());
});
