// Carga .env de la raíz antes de importar db.ts
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  /* en CI las variables vienen del entorno */
}
