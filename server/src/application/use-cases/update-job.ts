import { NotFoundError, ValidationError } from '../../domain/model/errors.ts';
import { isRecord, validateJobInput } from '../../domain/model/job-validation.ts';
import { assertJobFitsGraph } from '../job-references.ts';
import { toJobViews } from '../job-status.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import type { JobView } from '../views.ts';

export class UpdateJob {
  constructor(private readonly uow: UnitOfWork) {}

  /** Replaces the job. The body may omit `id`, but must not contradict the path. */
  async execute(id: string, raw: unknown): Promise<JobView> {
    if (isRecord(raw) && raw.id !== undefined && raw.id !== id) {
      throw new ValidationError([{ field: 'id', message: `must match the id in the path (${id})` }]);
    }
    const job = validateJobInput(isRecord(raw) ? { ...raw, id } : raw);

    return this.uow.run(async (repos) => {
      if (!(await repos.jobs.findById(id))) throw new NotFoundError(`Job ${id} not found`);

      const others = (await repos.jobs.list()).filter((j) => j.id !== id);
      const machines = await repos.machines.list();
      assertJobFitsGraph(job, others, machines);

      await repos.jobs.update(job);
      return (await toJobViews(repos, [job]))[0]!;
    });
  }
}
