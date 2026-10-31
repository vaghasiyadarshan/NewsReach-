// Read models returned by the use cases and serialized by the HTTP adapter. This module holds
// types only, so the web app can import them without pulling in any server runtime code.
import type { Execution, ExecutionLog, JobStatus } from '../models/execution.ts';
import type { Job, JsonObject, OperationType } from '../models/job.ts';
import type { MachineStatus } from '../models/machine.ts';
import type { Exclusion, Schedule, ScheduleStatus } from '../models/schedule.ts';

/** A job plus where it stands in the latest schedule. */
export type JobView = Job & { status: JobStatus };

/** An execution plus the planning facts needed to display it. */
export interface ExecutionRecord extends Execution {
  jobName: string;
  operationType: OperationType;
  machineId: string;
  scheduledStart: number;
  scheduledEnd: number;
}

export type ExecutionDetails = ExecutionRecord & { logs: ExecutionLog[] };

/** A schedule as the API exposes it: no snapshot, with derived status and staleness. */
export type ScheduleView = Omit<Schedule, 'snapshot' | 'fingerprint'> & {
  status: ScheduleStatus;
  /** True when jobs or machines changed after this schedule was generated. */
  stale: boolean;
  executions: ExecutionRecord[];
};

export interface RunResult {
  scheduleId: number;
  /** Jobs whose operation ran and succeeded during this call. */
  completed: string[];
  /** Jobs whose operation ran and raised an error during this call. */
  failed: string[];
  /** Jobs not run because a dependency failed or was itself blocked. */
  blocked: string[];
  /** Jobs left untouched because they were already in a final state (this is what makes repeats no-ops). */
  skipped: string[];
  schedule: ScheduleView;
}

export interface MachineLoad {
  id: string;
  name: string;
  status: MachineStatus;
  jobs: Array<{ jobId: string; jobName: string; start: number; end: number; status: JobStatus }>;
  busySlots: number;
  horizon: number;
  /** Share of the planning horizon this machine is occupied, 0 to 100. */
  workloadPercent: number;
}

export interface JobOverview {
  total: number;
  /** Assigned to a machine and waiting to run. */
  scheduled: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
  /** Not in the latest schedule: excluded by the scheduler, or never scheduled. */
  unscheduled: number;
}

export interface JobRow {
  id: string;
  name: string;
  operationType: OperationType;
  priority: number;
  status: JobStatus;
  machineId: string | null;
  scheduledStart: number | null;
  scheduledEnd: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  output: JsonObject | null;
  error: string | null;
  exclusionReason: string | null;
}

export interface SchedulerSummary {
  id: number;
  createdAt: Date;
  status: ScheduleStatus;
  stale: boolean;
  totalPriority: number;
  scheduledCount: number;
  makespan: number;
  exclusions: Exclusion[];
}

export interface DashboardView {
  horizon: number;
  machines: MachineLoad[];
  overview: JobOverview;
  jobs: JobRow[];
  /** Null until a schedule has been generated. */
  schedule: SchedulerSummary | null;
}
