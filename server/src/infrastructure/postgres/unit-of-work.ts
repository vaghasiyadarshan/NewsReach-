import type { Repositories, UnitOfWork } from '../../application/ports/repositories.ts';
import { PostgresDevDataRepository } from './dev-data-repository.ts';
import { PostgresExecutionRepository } from './execution-repository.ts';
import { PostgresJobRepository } from './job-repository.ts';
import { PostgresMachineRepository } from './machine-repository.ts';
import type { Pool, Queryable } from './pool.ts';
import { PostgresScheduleRepository } from './schedule-repository.ts';

/** All repositories bound to one connection, so they share its transaction. */
export function createRepositories(q: Queryable): Repositories {
  return {
    machines: new PostgresMachineRepository(q),
    jobs: new PostgresJobRepository(q),
    schedules: new PostgresScheduleRepository(q),
    executions: new PostgresExecutionRepository(q),
    devData: new PostgresDevDataRepository(q),
  };
}

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(createRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
