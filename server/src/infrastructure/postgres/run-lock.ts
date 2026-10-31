import type { RunLock } from '../../application/ports/run-lock.ts';
import type { Pool } from './pool.ts';

/** Namespace for schedule-run locks, so they cannot collide with other advisory locks. */
const SCHEDULE_RUN_NAMESPACE = 4242;

/**
 * A PostgreSQL session-level advisory lock held on a dedicated connection for the whole run. A
 * second caller blocks in `pg_advisory_lock` until the first releases it. If the process dies, the
 * connection closes and PostgreSQL releases the lock.
 */
export class PostgresRunLock implements RunLock {
  constructor(private readonly pool: Pool) {}

  async withLock<T>(key: number, work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1::int, $2::int)', [SCHEDULE_RUN_NAMESPACE, key]);
      try {
        return await work();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1::int, $2::int)', [SCHEDULE_RUN_NAMESPACE, key]);
      }
    } finally {
      client.release();
    }
  }
}
