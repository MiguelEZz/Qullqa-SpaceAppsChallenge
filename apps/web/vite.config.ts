import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-qullqa.png', 'logo-qullqa-white.png', 'logo-qullqa-white-lg.png'],
      manifest: {
        name: 'Qullqa',
        short_name: 'Qullqa',
        description: 'Decidir juntos qué sembrar, con datos NASA y observaciones de campo.',
        lang: 'es-PE',
        id: '/',
        start_url: '/',
        // Permite a la página saber si ya está instalada (navigator.getInstalledRelatedApps)
        related_applications: [{ platform: 'webapp', url: 'https://qullqa.us/manifest.webmanifest' }],
        prefer_related_applications: false,
        display: 'standalone',
        background_color: '#faf8f7',
        theme_color: '#b54423',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['push-sw.js'], // notificaciones del celular
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
