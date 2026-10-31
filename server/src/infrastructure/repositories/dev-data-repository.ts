import type { DevDataRepository } from '../../application/port/repositories.ts';
import type { Queryable } from '../orm/pool.ts';

export class PostgresDevDataRepository implements DevDataRepository {
  constructor(private readonly q: Queryable) {}

  async clearAll(): Promise<void> {
    await this.q.query(
      `TRUNCATE execution_logs, job_executions, schedule_exclusions, schedule_assignments, schedules,
                job_dependencies, job_eligible_machines, jobs, machines
       RESTART IDENTITY CASCADE`,
    );
  }
}
