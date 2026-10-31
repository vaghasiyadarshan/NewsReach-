import { NotFoundError } from '../../domain/model/errors.ts';
import { toExecutionRecords } from '../execution-records.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { ExecutionDetails } from '../views.ts';

export type { ExecutionDetails } from '../views.ts';

export class GetExecution {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(id: number): Promise<ExecutionDetails> {
    return this.uow.run(async (repos) => {
      const execution = await repos.executions.findById(id);
      if (!execution) throw new NotFoundError(`Execution ${id} not found`);
      const [record] = await toExecutionRecords(repos, [execution]);
      return { ...record!, logs: await repos.executions.logs(id) };
    });
  }
}
