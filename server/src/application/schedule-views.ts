import { deriveScheduleStatus } from '../domain/execution/lifecycle.ts';
import type { Schedule } from '../domain/model/schedule.ts';
import { toExecutionRecords } from './execution-records.ts';
import { computeFingerprint, snapshotOf } from './fingerprint.ts';
import type { Repositories } from './ports/repositories.ts';
import type { ScheduleView } from './views.ts';

/** True when jobs or machines no longer match what the schedule was computed from. */
export async function isStale(repos: Repositories, schedule: Schedule): Promise<boolean> {
  const current = snapshotOf(await repos.jobs.list(), await repos.machines.list());
  return computeFingerprint(current) !== schedule.fingerprint;
}

/** Builds the API view of a schedule: derived status, staleness and its executions. */
export async function toScheduleView(repos: Repositories, schedule: Schedule): Promise<ScheduleView> {
  const executions = await repos.executions.listBySchedule(schedule.id);
  const { snapshot: _snapshot, fingerprint: _fingerprint, ...rest } = schedule;
  return {
    ...rest,
    status: deriveScheduleStatus(executions.map((e) => e.status)),
    stale: await isStale(repos, schedule),
    executions: await toExecutionRecords(repos, executions, schedule),
  };
}
