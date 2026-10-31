import { NotFoundError } from '../../domain/model/errors.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import { toScheduleView } from '../schedule-views.ts';
import type { ScheduleView } from '../views.ts';

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
