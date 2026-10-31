import { createApp } from './app.ts';
import { createUseCases } from '../di/composition.ts';
import { runMigrations } from '../orm/migrate.ts';
import { createPool } from '../orm/pool.ts';

const pool = createPool();
const applied = await runMigrations(pool);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = createApp(createUseCases(pool), {
  enableDevRoutes: process.env.NODE_ENV !== 'production',
  log: console.log,
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

function shutDownServer(): void {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGINT', shutDownServer);
process.on('SIGTERM', shutDownServer);
