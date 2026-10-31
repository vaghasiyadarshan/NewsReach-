import { createUseCases } from '../../composition.ts';
import { migrate } from './migrate.ts';
import { createPool } from './pool.ts';

const pool = createPool();
try {
  await migrate(pool);
  const { machines, jobs } = await createUseCases(pool).resetSampleData.execute();
  console.log(`Loaded sample data: ${machines} machines, ${jobs} jobs`);
} finally {
  await pool.end();
}
