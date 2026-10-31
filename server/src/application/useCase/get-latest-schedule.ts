import { NotFoundError } from '../errors/errors.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import { toScheduleView } from '../helper/schedule-views.ts';
import type { ScheduleView } from '../../domain/types/views.ts';

export class GetLatestSchedule {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(): Promise<ScheduleView> {
    return this.uow.run(async (repos) => {
      const latest = await repos.schedules.findLatest();
      if (!latest) throw new NotFoundError('No schedule has been generated yet');
      return toScheduleView(repos, latest);
    });
  }
}
