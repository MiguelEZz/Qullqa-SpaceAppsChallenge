import { buildApp } from './app.ts';
import { migrate } from './db.ts';
import { seedCommunities } from './communityCatalog.ts';
import { schedulePersonalPlans } from './routes/runs.ts';

const applied = await migrate();
await seedCommunities();
const app = await buildApp();
if (applied.length) app.log.info({ applied }, 'migraciones aplicadas');

const port = Number(process.env.API_PORT ?? 3000);
// 0.0.0.0 para que Caddy (en docker) llegue vía host.docker.internal
await app.listen({ host: '0.0.0.0', port });

// Planes personales: quien envió sus datos y sigue solo después de 3 días recibe su plan igual
const tick = () => void schedulePersonalPlans((m) => app.log.info(m)).catch((err) => app.log.error(err, 'planes personales'));
setTimeout(tick, 15_000);
setInterval(tick, 10 * 60_000);
