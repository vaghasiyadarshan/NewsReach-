import type { JsonObject } from './job.ts';

export type ExecutionStatus = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';

/** What a job shows on the dashboard: an execution status, or one of two "no execution" states. */
export type JobStatus = ExecutionStatus | 'PENDING' | 'UNSCHEDULED';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface ExecutionLog {
  id: number;
  executionId: number;
  ts: Date;
  level: LogLevel;
  message: string;
}

export interface Execution {
  id: number;
  scheduleId: number;
  jobId: string;
  status: ExecutionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  output: JsonObject | null;
  error: string | null;
}
