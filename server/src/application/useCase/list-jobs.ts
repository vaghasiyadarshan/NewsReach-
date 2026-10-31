import { toJobViews } from '../helper/job-status.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import type { JobView } from '../../domain/types/views.ts';

export class ListJobs {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(): Promise<JobView[]> {
    return this.uow.run(async (repos) => toJobViews(repos, await repos.jobs.list()));
  }
}
