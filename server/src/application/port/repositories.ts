import type { Execution, ExecutionLog, ExecutionStatus, LogLevel } from '../../domain/models/execution.ts';
import type { Job, JsonObject } from '../../domain/models/job.ts';
import type { Machine } from '../../domain/models/machine.ts';
import type { Schedule, ScheduleInputSnapshot, ScheduleResult } from '../../domain/models/schedule.ts';

export interface MachineRepository {
  /** Sorted by ID. */
  list(): Promise<Machine[]>;
  insertMany(machines: readonly Machine[]): Promise<void>;
}

export interface JobRepository {
  /** Sorted by ID, with eligible machines and dependencies. */
  list(): Promise<Job[]>;
  findById(id: string): Promise<Job | null>;
  insert(job: Job): Promise<void>;
  /** Replaces every field of the job, including its eligible machines and dependencies. */
  update(job: Job): Promise<void>;
}

export interface NewSchedule {
  result: ScheduleResult;
  snapshot: ScheduleInputSnapshot;
  fingerprint: string;
  solverStats: Record<string, unknown>;
  createdAt: Date;
}

export interface ScheduleRepository {
  /**
   * Stores the schedule with its assignments and exclusions, and creates one SCHEDULED execution
   * per assignment, as a single unit.
   */
  create(schedule: NewSchedule): Promise<Schedule>;
  findLatest(): Promise<Schedule | null>;
  findById(id: number): Promise<Schedule | null>;
}

export interface ExecutionPatch {
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  output?: JsonObject;
  error?: string;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  ts: Date;
}

export interface ExecutionRepository {
  /** Ordered by scheduled start, then job ID. */
  listBySchedule(scheduleId: number): Promise<Execution[]>;
  /** Newest first. */
  listAll(): Promise<Execution[]>;
  findById(id: number): Promise<Execution | null>;
  /**
   * Moves an execution from `from` to `to` and applies `patch`. Refuses transitions the lifecycle
   * does not allow, and refuses (ConflictError) when the stored status is no longer `from`, so two
   * writers can never both win.
   */
  transition(id: number, from: ExecutionStatus, to: ExecutionStatus, patch?: ExecutionPatch): Promise<Execution>;
  addLog(executionId: number, entry: LogEntry): Promise<void>;
  /** Ordered oldest first. */
  listLogs(executionId: number): Promise<ExecutionLog[]>;
}

/** Development support: wipes all data so the sample data can be loaded again. */
export interface DevDataRepository {
  clearAll(): Promise<void>;
}

export interface Repositories {
  machines: MachineRepository;
  jobs: JobRepository;
  schedules: ScheduleRepository;
  executions: ExecutionRepository;
  devData: DevDataRepository;
}

/** Runs `work` atomically: everything it writes is committed together or not at all. */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
