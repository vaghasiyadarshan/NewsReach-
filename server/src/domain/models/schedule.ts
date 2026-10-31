import type { Job } from './job.ts';
import type { Machine } from './machine.ts';

export interface Assignment {
  jobId: string;
  machineId: string;
  /** Inclusive start slot; the job occupies [start, end). */
  start: number;
  /** Exclusive end slot (= start + duration). */
  end: number;
}

export type ExclusionCode =
  | 'WINDOW_TOO_SMALL'
  | 'NO_AVAILABLE_MACHINE'
  | 'DEPENDENCY_EXCLUDED'
  | 'DISPLACED';

export interface Exclusion {
  jobId: string;
  code: ExclusionCode;
  reason: string;
}

/** Output of the pure scheduling engine. */
export interface ScheduleResult {
  assignments: Assignment[];
  exclusions: Exclusion[];
  totalPriority: number;
  scheduledCount: number;
  makespan: number;
}

/** Everything the scheduler was computed from; stored with the schedule. */
export interface ScheduleInputSnapshot {
  jobs: Job[];
  machines: Machine[];
}

export interface Schedule extends ScheduleResult {
  id: number;
  createdAt: Date;
  /** Hash of the snapshot; a different hash for the current data means the schedule is stale. */
  fingerprint: string;
  snapshot: ScheduleInputSnapshot;
  solverStats: Record<string, unknown>;
}

export type ScheduleStatus = 'GENERATED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_FAILURES';
