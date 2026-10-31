import { createPool } from './pool.ts';
import { runMigrations } from './migrate.ts';

const pool = createPool();
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await pool.end();
}
