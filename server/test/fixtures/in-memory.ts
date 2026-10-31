import { assertTransition } from '../../src/application/helper/execution/lifecycle.ts';
import { ConflictError, NotFoundError } from '../../src/application/errors/errors.ts';
import type { Execution, ExecutionLog, ExecutionStatus } from '../../src/domain/models/execution.ts';
import type { Job } from '../../src/domain/models/job.ts';
import type { Machine } from '../../src/domain/models/machine.ts';
import type { Schedule } from '../../src/domain/models/schedule.ts';
import type { Clock } from '../../src/application/port/clock.ts';
import type {
  ExecutionPatch,
  LogEntry,
  NewSchedule,
  Repositories,
  UnitOfWork,
} from '../../src/application/port/repositories.ts';
import type { RunLock } from '../../src/application/port/run-lock.ts';

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Shared state behind the fake repositories; one store is one "database". */
export class InMemoryStore {
  machines = new Map<string, Machine>();
  jobs = new Map<string, Job>();
  schedules: Schedule[] = [];
  executions: Execution[] = [];
  logs: ExecutionLog[] = [];
  private nextExecutionId = 1;
  private nextLogId = 1;
  private nextScheduleId = 1;

  readonly repos: Repositories = {
    machines: {
      list: async () => [...this.machines.values()].sort(byId).map((m) => ({ ...m })),
      insertMany: async (machines) => {
        for (const m of machines) this.machines.set(m.id, { ...m });
      },
    },

    jobs: {
      list: async () => [...this.jobs.values()].sort(byId).map((j) => structuredClone(j)),
      findById: async (id) => {
        const job = this.jobs.get(id);
        return job ? structuredClone(job) : null;
      },
      insert: async (job) => {
        if (this.jobs.has(job.id)) throw new ConflictError(`Job ${job.id} already exists`);
        this.jobs.set(job.id, structuredClone(job));
      },
      update: async (job) => {
        this.jobs.set(job.id, structuredClone(job));
      },
    },

    schedules: {
      create: async (draft: NewSchedule) => {
        const schedule: Schedule = {
          id: this.nextScheduleId++,
          createdAt: draft.createdAt,
          fingerprint: draft.fingerprint,
          snapshot: structuredClone(draft.snapshot),
          solverStats: draft.solverStats,
          ...structuredClone(draft.result),
        };
        this.schedules.push(schedule);
        for (const a of schedule.assignments) {
          this.executions.push({
            id: this.nextExecutionId++,
            scheduleId: schedule.id,
            jobId: a.jobId,
            status: 'SCHEDULED',
            startedAt: null,
            completedAt: null,
            durationMs: null,
            output: null,
            error: null,
          });
        }
        return structuredClone(schedule);
      },
      findLatest: async () => {
        const latest = this.schedules.at(-1);
        return latest ? structuredClone(latest) : null;
      },
      findById: async (id) => {
        const found = this.schedules.find((s) => s.id === id);
        return found ? structuredClone(found) : null;
      },
    },

    executions: {
      listBySchedule: async (scheduleId) => {
        const schedule = this.schedules.find((s) => s.id === scheduleId);
        const start = (jobId: string) => schedule?.assignments.find((a) => a.jobId === jobId)?.start ?? 0;
        return this.executions
          .filter((e) => e.scheduleId === scheduleId)
          .sort((a, b) => start(a.jobId) - start(b.jobId) || (a.jobId < b.jobId ? -1 : 1))
          .map((e) => structuredClone(e));
      },
      listAll: async () => [...this.executions].sort((a, b) => b.id - a.id).map((e) => structuredClone(e)),
      findById: async (id) => {
        const found = this.executions.find((e) => e.id === id);
        return found ? structuredClone(found) : null;
      },
      transition: async (id, from, to, patch: ExecutionPatch = {}) => {
        assertTransition(from, to);
        const execution = this.executions.find((e) => e.id === id);
        if (!execution) throw new NotFoundError(`Execution ${id} not found`);
        if (execution.status !== from) {
          throw new ConflictError(`Execution ${id} is ${execution.status}, expected ${from}`);
        }
        execution.status = to as ExecutionStatus;
        if (patch.startedAt) execution.startedAt = patch.startedAt;
        if (patch.completedAt) execution.completedAt = patch.completedAt;
        if (patch.durationMs !== undefined) execution.durationMs = patch.durationMs;
        if (patch.output) execution.output = patch.output;
        if (patch.error !== undefined) execution.error = patch.error;
        return structuredClone(execution);
      },
      addLog: async (executionId: number, entry: LogEntry) => {
        this.logs.push({ id: this.nextLogId++, executionId, ...entry });
      },
      listLogs: async (executionId) => this.logs.filter((l) => l.executionId === executionId).map((l) => ({ ...l })),
    },

    devData: {
      clearAll: async () => {
        this.machines.clear();
        this.jobs.clear();
        this.schedules = [];
        this.executions = [];
        this.logs = [];
      },
    },
  };

  readonly uow: UnitOfWork = { run: (work) => work(this.repos) };
}

/** A clock that moves forward 10 ms on every reading, so durations and ordering are deterministic. */
export class TickingClock implements Clock {
  private current = Date.UTC(2026, 0, 1);
  now(): Date {
    const date = new Date(this.current);
    this.current += 10;
    return date;
  }
}

/** Per-key mutex with the same waiting behaviour as the advisory lock. */
export class InMemoryRunLock implements RunLock {
  private tails = new Map<number, Promise<unknown>>();

  async withLock<T>(key: number, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(work, work);
    this.tails.set(key, result.catch(() => undefined));
    return result;
  }
}
