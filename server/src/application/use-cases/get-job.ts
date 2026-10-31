import { NotFoundError } from '../../domain/model/errors.ts';
import { toJobViews } from '../job-status.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { JobView } from '../views.ts';

export class GetJob {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(id: string): Promise<JobView> {
    return this.uow.run(async (repos) => {
      const job = await repos.jobs.findById(id);
      if (!job) throw new NotFoundError(`Job ${id} not found`);
      return (await toJobViews(repos, [job]))[0]!;
    });
  }
}
