import { ConflictError } from '../../domain/model/errors.ts';
import { validateJobInput } from '../../domain/model/job-validation.ts';
import { assertJobFitsGraph } from '../job-references.ts';
import { toJobViews } from '../job-status.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { JobView } from '../views.ts';

export class CreateJob {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(raw: unknown): Promise<JobView> {
    const job = validateJobInput(raw);

    return this.uow.run(async (repos) => {
      if (await repos.jobs.findById(job.id)) throw new ConflictError(`Job ${job.id} already exists`);

      const jobs = await repos.jobs.list();
      const machines = await repos.machines.list();
      assertJobFitsGraph(job, jobs, machines);

      await repos.jobs.insert(job);
      return (await toJobViews(repos, [job]))[0]!;
    });
  }
}
