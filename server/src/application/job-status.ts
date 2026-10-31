import type { Execution, JobStatus } from '../domain/model/execution.ts';
import type { Job } from '../domain/model/job.ts';
import type { Schedule } from '../domain/model/schedule.ts';
import type { Repositories } from './ports/repositories.ts';
import type { JobView } from './views.ts';

/**
 * A job's status is its execution status in the latest schedule. Jobs the latest schedule excluded
 * are UNSCHEDULED; jobs it never considered (no schedule yet, or added since) are PENDING.
 */
export function deriveJobStatus(jobId: string, schedule: Schedule | null, executions: readonly Execution[]): JobStatus {
  if (!schedule) return 'PENDING';
  const execution = executions.find((e) => e.jobId === jobId);
  if (execution) return execution.status;
  return schedule.exclusions.some((e) => e.jobId === jobId) ? 'UNSCHEDULED' : 'PENDING';
}

export async function toJobViews(repos: Repositories, jobs: readonly Job[]): Promise<JobView[]> {
  const schedule = await repos.schedules.findLatest();
  const executions = schedule ? await repos.executions.listBySchedule(schedule.id) : [];
  return jobs.map((job) => ({ ...job, status: deriveJobStatus(job.id, schedule, executions) }));
}
