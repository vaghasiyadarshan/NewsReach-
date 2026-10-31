import { PostgresDevDataRepository } from '../src/infrastructure/postgres/dev-data-repository.ts';
import { createPool, type Pool } from '../src/infrastructure/postgres/pool.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://newsreach:newsreach@localhost:5432/newsreach_test';

export function createTestPool(): Pool {
  return createPool(TEST_DATABASE_URL);
}

export async function truncateAll(pool: Pool): Promise<void> {
  await new PostgresDevDataRepository(pool).clearAll();
}
