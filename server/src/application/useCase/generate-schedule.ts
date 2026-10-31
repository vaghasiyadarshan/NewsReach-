import { solve } from '../helper/scheduling/solver.ts';
import { computeFingerprint, snapshotOf } from '../helper/fingerprint.ts';
import type { Clock } from '../port/clock.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import { toScheduleView } from '../helper/schedule-views.ts';
import type { ScheduleView } from '../../domain/types/views.ts';

export class GenerateSchedule {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Computes the optimal schedule for all stored jobs and persists it with a snapshot of its input.
   * Invalid graphs and inputs beyond the scheduling limits are rejected by the solver before
   * anything is written.
   */
  async execute(): Promise<ScheduleView> {
    return this.uow.run(async (repos) => {
      const jobs = await repos.jobs.list();
      const machines = await repos.machines.list();

      const { stats, ...result } = solve({ jobs, machines });
      const snapshot = snapshotOf(jobs, machines);

      const schedule = await repos.schedules.create({
        result,
        snapshot,
        fingerprint: computeFingerprint(snapshot),
        solverStats: { ...stats },
        createdAt: this.clock.now(),
      });
      return toScheduleView(repos, schedule);
    });
  }
}
