import { ConflictError } from '../errors/errors.ts';
import { validateJobInput } from '../helper/job-validation.ts';
import { assertJobFitsGraph } from '../helper/job-references.ts';
import { toJobViews } from '../helper/job-status.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import type { JobView } from '../../domain/types/views.ts';

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
