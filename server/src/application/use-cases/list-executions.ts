import { toExecutionRecords } from '../execution-records.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { ExecutionRecord } from '../views.ts';

export class ListExecutions {
  constructor(private readonly uow: UnitOfWork) {}

  /** Execution history, newest first, optionally limited to one schedule. */
  async execute(filter: { scheduleId?: number } = {}): Promise<ExecutionRecord[]> {
    return this.uow.run(async (repos) => {
      const all = await repos.executions.listAll();
      const selected = filter.scheduleId === undefined ? all : all.filter((e) => e.scheduleId === filter.scheduleId);
      return toExecutionRecords(repos, selected);
    });
  }
}
