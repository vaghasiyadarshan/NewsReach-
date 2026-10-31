import { runOperation as defaultRunOperation } from '../helper/execution/operations.ts';
import { ConflictError, NotFoundError, OperationError } from '../errors/errors.ts';
import type { Execution, ExecutionStatus } from '../../domain/models/execution.ts';
import type { Job, JsonObject } from '../../domain/models/job.ts';
import type { Schedule } from '../../domain/models/schedule.ts';
import type { Clock } from '../port/clock.ts';
import type { UnitOfWork } from '../port/repositories.ts';
import type { RunLock } from '../port/run-lock.ts';
import { isStale, toScheduleView } from '../helper/schedule-views.ts';
import type { RunResult } from '../../domain/types/views.ts';

export type { RunResult } from '../../domain/types/views.ts';

export interface RunScheduleInput {
  /** Defaults to the latest schedule. */
  scheduleId?: number;
}

export class RunSchedule {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly lock: RunLock,
    private readonly runOperation: typeof defaultRunOperation = defaultRunOperation,
  ) {}

  async execute(input: RunScheduleInput = {}): Promise<RunResult> {
    const scheduleId = await this.resolveScheduleId(input.scheduleId);
    // One run per schedule at a time: a concurrent request waits here, then finds nothing left to do.
    return this.lock.withLock(scheduleId, () => this.runWhileLocked(scheduleId));
  }

  private async resolveScheduleId(requested?: number): Promise<number> {
    return this.uow.run(async (repos) => {
      const schedule = requested === undefined ? await repos.schedules.findLatest() : await repos.schedules.findById(requested);
      if (!schedule) {
        throw new NotFoundError(
          requested === undefined ? 'No schedule has been generated yet' : `Schedule ${requested} not found`,
        );
      }
      return schedule.id;
    });
  }

  private async runWhileLocked(scheduleId: number): Promise<RunResult> {
    const { schedule, executions } = await this.uow.run(async (repos) => {
      const current = (await repos.schedules.findById(scheduleId))!;
      if (await isStale(repos, current)) {
        throw new ConflictError('The schedule is stale: jobs or machines changed since it was generated. Generate a new schedule first.');
      }
      return { schedule: current, executions: await repos.executions.listBySchedule(scheduleId) };
    });

    const jobs = new Map(schedule.snapshot.jobs.map((j) => [j.id, j] as const));
    const status = new Map<string, ExecutionStatus>(executions.map((e) => [e.jobId, e.status]));
    const outputs = new Map<string, JsonObject>();
    for (const e of executions) if (e.status === 'COMPLETED' && e.output) outputs.set(e.jobId, e.output);

    const result: Omit<RunResult, 'schedule'> = { scheduleId, completed: [], failed: [], blocked: [], skipped: [] };

    // Scheduled order (start, then job ID) already lists dependencies first, but gating below
    // re-checks every dependency instead of trusting that order.
    for (const execution of executions) {
      if (execution.status !== 'SCHEDULED') {
        result.skipped.push(execution.jobId);
        continue;
      }
      const job = jobs.get(execution.jobId)!;

      const badDeps = job.dependencies.filter((d) => status.get(d) === 'FAILED' || status.get(d) === 'BLOCKED');
      if (badDeps.length > 0) {
        await this.markBlocked(execution, badDeps.map((d) => `${d} ${status.get(d)}`));
        status.set(job.id, 'BLOCKED');
        result.blocked.push(job.id);
        continue;
      }
      if (!job.dependencies.every((d) => status.get(d) === 'COMPLETED')) {
        result.skipped.push(job.id); // a dependency is neither done nor failed; leave this job for a later run
        continue;
      }

      const dependencyOutputs = Object.fromEntries(job.dependencies.map((d) => [d, outputs.get(d) ?? {}]));
      const outcome = await this.executeJob(schedule, execution, job, dependencyOutputs);
      status.set(job.id, outcome.status);
      if (outcome.status === 'COMPLETED') {
        outputs.set(job.id, outcome.output);
        result.completed.push(job.id);
      } else {
        result.failed.push(job.id);
      }
    }

    const view = await this.uow.run(async (repos) => toScheduleView(repos, (await repos.schedules.findById(scheduleId))!));
    return { ...result, schedule: view };
  }

  private async markBlocked(execution: Execution, reasons: string[]): Promise<void> {
    const message = `Blocked: dependency ${reasons.join(', ')}`;
    await this.uow.run(async (repos) => {
      await repos.executions.transition(execution.id, 'SCHEDULED', 'BLOCKED', { error: message });
      await repos.executions.addLog(execution.id, { level: 'WARN', message, ts: this.clock.now() });
    });
  }

  /**
   * Two transactions around the operation: the first commits RUNNING so observers can see it, the
   * operation itself runs outside any transaction, the second records the outcome and its log.
   */
  private async executeJob(
    schedule: Schedule,
    execution: Execution,
    job: Job,
    dependencyOutputs: Record<string, JsonObject>,
  ): Promise<{ status: 'COMPLETED'; output: JsonObject } | { status: 'FAILED' }> {
    const assignment = schedule.assignments.find((a) => a.jobId === job.id)!;
    const startedAt = this.clock.now();
    await this.uow.run(async (repos) => {
      await repos.executions.transition(execution.id, 'SCHEDULED', 'RUNNING', { startedAt });
      await repos.executions.addLog(execution.id, {
        level: 'INFO',
        message: `Started ${job.operationType} on ${assignment.machineId} (planned slots [${assignment.start}, ${assignment.end}))`,
        ts: startedAt,
      });
    });

    let output: JsonObject | undefined;
    let error: string | undefined;
    try {
      output = this.runOperation(job.operationType, job.inputData, { dependencyOutputs });
    } catch (e) {
      error = e instanceof OperationError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
    }

    const completedAt = this.clock.now();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    await this.uow.run(async (repos) => {
      if (output) {
        await repos.executions.transition(execution.id, 'RUNNING', 'COMPLETED', { completedAt, durationMs, output });
        await repos.executions.addLog(execution.id, { level: 'INFO', message: `Completed in ${durationMs} ms`, ts: completedAt });
      } else {
        await repos.executions.transition(execution.id, 'RUNNING', 'FAILED', { completedAt, durationMs, error: error! });
        await repos.executions.addLog(execution.id, { level: 'ERROR', message: `Failed: ${error}`, ts: completedAt });
      }
    });

    return output ? { status: 'COMPLETED', output } : { status: 'FAILED' };
  }
}
