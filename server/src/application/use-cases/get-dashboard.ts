import type { JobStatus } from '../../domain/model/execution.ts';
import { HORIZON } from '../../domain/scheduling/limits.ts';
import { deriveJobStatus } from '../job-status.ts';
import type { UnitOfWork } from '../ports/repositories.ts';
import { toScheduleView } from '../schedule-views.ts';
import type { DashboardView, JobOverview, JobRow, MachineLoad } from '../views.ts';

export type { DashboardView, JobOverview, JobRow, MachineLoad, SchedulerSummary } from '../views.ts';

export class GetDashboard {
  constructor(private readonly uow: UnitOfWork) {}

  /** Everything the monitoring page shows, read consistently in one transaction. */
  async execute(): Promise<DashboardView> {
    return this.uow.run(async (repos) => {
      const jobs = await repos.jobs.list();
      const machines = await repos.machines.list();
      const latest = await repos.schedules.findLatest();
      const view = latest ? await toScheduleView(repos, latest) : null;
      const records = view?.executions ?? [];

      const rows: JobRow[] = jobs.map((job) => {
        const record = records.find((r) => r.jobId === job.id);
        const exclusion = view?.exclusions.find((e) => e.jobId === job.id);
        return {
          id: job.id,
          name: job.name,
          operationType: job.operationType,
          priority: job.priority,
          status: deriveJobStatus(job.id, latest, records),
          machineId: record?.machineId ?? null,
          scheduledStart: record?.scheduledStart ?? null,
          scheduledEnd: record?.scheduledEnd ?? null,
          startedAt: record?.startedAt ?? null,
          completedAt: record?.completedAt ?? null,
          durationMs: record?.durationMs ?? null,
          output: record?.output ?? null,
          error: record?.error ?? null,
          exclusionReason: exclusion?.reason ?? null,
        };
      });

      const count = (...statuses: JobStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;
      const overview: JobOverview = {
        total: rows.length,
        scheduled: count('SCHEDULED'),
        running: count('RUNNING'),
        completed: count('COMPLETED'),
        failed: count('FAILED'),
        blocked: count('BLOCKED'),
        unscheduled: count('PENDING', 'UNSCHEDULED'),
      };

      const machineLoads: MachineLoad[] = machines.map((machine) => {
        const assigned = records.filter((r) => r.machineId === machine.id);
        const busySlots = assigned.reduce((sum, r) => sum + (r.scheduledEnd - r.scheduledStart), 0);
        return {
          id: machine.id,
          name: machine.name,
          status: machine.status,
          jobs: assigned.map((r) => ({
            jobId: r.jobId,
            jobName: r.jobName,
            start: r.scheduledStart,
            end: r.scheduledEnd,
            status: r.status,
          })),
          busySlots,
          horizon: HORIZON,
          workloadPercent: Math.round((busySlots / HORIZON) * 100),
        };
      });

      return {
        horizon: HORIZON,
        machines: machineLoads,
        overview,
        jobs: rows,
        schedule: view && {
          id: view.id,
          createdAt: view.createdAt,
          status: view.status,
          stale: view.stale,
          totalPriority: view.totalPriority,
          scheduledCount: view.scheduledCount,
          makespan: view.makespan,
          exclusions: view.exclusions,
        },
      };
    });
  }
}
