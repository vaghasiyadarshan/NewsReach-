import { createUseCases } from '../di/composition.ts';
import { runMigrations } from './migrate.ts';
import { createPool } from './pool.ts';

const pool = createPool();
try {
  await runMigrations(pool);
  const { machines, jobs } = await createUseCases(pool).resetSampleData.execute();
  console.log(`Loaded sample data: ${machines} machines, ${jobs} jobs`);
} finally {
  await pool.end();
}
