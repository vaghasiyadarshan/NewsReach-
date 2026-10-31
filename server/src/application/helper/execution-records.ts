import type { Execution } from '../../domain/models/execution.ts';
import type { Schedule } from '../../domain/models/schedule.ts';
import type { Repositories } from '../port/repositories.ts';
import type { ExecutionRecord } from '../../domain/types/views.ts';

/**
 * Adds job name, operation, machine and planned slots to executions, taken from the schedule each
 * execution belongs to (the snapshot, so history stays accurate if the job is edited later).
 */
export async function toExecutionRecords(
  repos: Repositories,
  executions: readonly Execution[],
  knownSchedule?: Schedule,
): Promise<ExecutionRecord[]> {
  const schedules = new Map<number, Schedule | null>();
  if (knownSchedule) schedules.set(knownSchedule.id, knownSchedule);

  const records: ExecutionRecord[] = [];
  for (const execution of executions) {
    if (!schedules.has(execution.scheduleId)) {
      schedules.set(execution.scheduleId, await repos.schedules.findById(execution.scheduleId));
    }
    const schedule = schedules.get(execution.scheduleId);
    const assignment = schedule?.assignments.find((a) => a.jobId === execution.jobId);
    const job = schedule?.snapshot.jobs.find((j) => j.id === execution.jobId);
    if (!schedule || !assignment || !job) continue; // cannot happen: executions are created from assignments

    records.push({
      ...execution,
      jobName: job.name,
      operationType: job.operationType,
      machineId: assignment.machineId,
      scheduledStart: assignment.start,
      scheduledEnd: assignment.end,
    });
  }
  return records;
}
