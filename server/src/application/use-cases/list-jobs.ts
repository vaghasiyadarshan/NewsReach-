import { toJobViews } from '../job-status.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { JobView } from '../views.ts';

export class ListJobs {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(): Promise<JobView[]> {
    return this.uow.run(async (repos) => toJobViews(repos, await repos.jobs.list()));
  }
}
