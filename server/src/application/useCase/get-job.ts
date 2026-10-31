import { NotFoundError } from '../errors/errors.ts';
import { toJobViews } from '../helper/job-status.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import type { JobView } from '../../domain/types/views.ts';

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
