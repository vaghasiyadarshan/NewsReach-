import { describe, expect, it } from 'vitest';
import { GenerateSchedule } from '../../../../src/application/useCase/generate-schedule.ts';
import { GetExecution } from '../../../../src/application/useCase/get-execution.ts';
import { ListExecutions } from '../../../../src/application/useCase/list-executions.ts';
import { RunSchedule } from '../../../../src/application/useCase/run-schedule.ts';
import { ConflictError, NotFoundError } from '../../../../src/application/errors/errors.ts';
import { job } from '../../../fixtures/fixtures.ts';
import { InMemoryRunLock, InMemoryStore, TickingClock } from '../../../fixtures/in-memory.ts';
import { seedSample } from '../../../fixtures/seed.ts';

async function setup(prepare: (store: InMemoryStore) => void | Promise<void> = () => {}) {
  const store = new InMemoryStore();
  await seedSample(store.repos);
  await prepare(store);
  const clock = new TickingClock();
  await new GenerateSchedule(store.uow, clock).execute();
  const run = new RunSchedule(store.uow, clock, new InMemoryRunLock());
  return { store, run, clock };
}

const execOf = (store: InMemoryStore, jobId: string) => store.executions.find((e) => e.jobId === jobId)!;
const logsOf = (store: InMemoryStore, jobId: string) =>
  store.logs.filter((l) => l.executionId === execOf(store, jobId).id).map((l) => l.message);

describe('RunSchedule: happy path', () => {
  it('executes every job for real and completes the schedule', async () => {
    const { store, run } = await setup();
    const result = await run.execute();

    expect(result.completed).toEqual(['J1', 'J2', 'J3', 'J6', 'J4', 'J5']);
    expect(result).toMatchObject({ failed: [], blocked: [], skipped: [] });
    expect(result.schedule.status).toBe('COMPLETED');

    // actual operation results, not just assignments
    expect(execOf(store, 'J1').output).toMatchObject({ valid: true });
    expect(execOf(store, 'J2').output).toEqual({ wordCount: expect.any(Number) });
    expect((execOf(store, 'J2').output as { wordCount: number }).wordCount).toBeGreaterThan(40);
    expect(execOf(store, 'J3').output).toMatchObject({ summaryWords: 20 });
    expect(execOf(store, 'J4').output).toMatchObject({ valid: true, author: 'Priya Nair' });
  });

  it('passes dependency outputs, keyed by dependency job id, to BUILD_EDITORIAL_REPORT', async () => {
    const { store, run } = await setup();
    await run.execute();
    const report = execOf(store, 'J5').output as { results: Record<string, unknown>; dependencyCount: number };
    expect(report.dependencyCount).toBe(1);
    expect(report.results.J2).toEqual(execOf(store, 'J2').output);
  });

  it('records start, completion and duration for each executed job', async () => {
    const { store, run } = await setup();
    await run.execute();
    for (const e of store.executions) {
      expect(e.startedAt).toBeInstanceOf(Date);
      expect(e.completedAt).toBeInstanceOf(Date);
      expect(e.durationMs).toBe(e.completedAt!.getTime() - e.startedAt!.getTime());
      expect(e.error).toBeNull();
    }
  });

  it('writes a start and a completion log for each job', async () => {
    const { store, run } = await setup();
    await run.execute();
    const logs = logsOf(store, 'J1');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('Started VALIDATE_ARTICLE on M2');
    expect(logs[1]).toContain('Completed');
  });

  it('runs jobs in scheduled order: start slot, then job id', async () => {
    const { store, run } = await setup();
    await run.execute();
    const order = [...store.executions].sort((a, b) => a.startedAt!.getTime() - b.startedAt!.getTime()).map((e) => e.jobId);
    expect(order).toEqual(['J1', 'J2', 'J3', 'J6', 'J4', 'J5']);
  });

  // Mandatory test 3 at execution level: a dependent starts only after its dependency completes
  it('starts a dependent only after its dependency has completed', async () => {
    const { store, run } = await setup();
    await run.execute();
    expect(execOf(store, 'J3').startedAt!.getTime()).toBeGreaterThanOrEqual(execOf(store, 'J1').completedAt!.getTime());
    expect(execOf(store, 'J5').startedAt!.getTime()).toBeGreaterThanOrEqual(execOf(store, 'J2').completedAt!.getTime());
  });
});

describe('RunSchedule: failure and blocked jobs', () => {
  const emptyTitleOnJ1 = (store: InMemoryStore) => {
    store.jobs.get('J1')!.inputData = { title: '', body: 'text' };
  };

  // Mandatory test 7: if a dependency fails, its dependent job becomes BLOCKED
  it('fails a job whose operation errors and blocks its dependent without executing it', async () => {
    const { store, run } = await setup(emptyTitleOnJ1);
    const result = await run.execute();

    expect(result.failed).toEqual(['J1']);
    expect(result.blocked).toEqual(['J3']);
    expect(execOf(store, 'J1')).toMatchObject({ status: 'FAILED', error: 'Missing or empty field: title' });
    expect(execOf(store, 'J1').output).toBeNull();

    const blocked = execOf(store, 'J3');
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.error).toContain('J1 FAILED');
    expect(blocked.startedAt).toBeNull();
    expect(blocked.output).toBeNull();
    expect(logsOf(store, 'J3').some((m) => m.startsWith('Started'))).toBe(false);
  });

  it('keeps running jobs that do not depend on the failed job', async () => {
    const { store, run } = await setup(emptyTitleOnJ1);
    await run.execute();
    for (const id of ['J2', 'J4', 'J5', 'J6']) expect(execOf(store, id).status, id).toBe('COMPLETED');
  });

  it('reports the schedule as completed with failures', async () => {
    const { run } = await setup(emptyTitleOnJ1);
    expect((await run.execute()).schedule.status).toBe('COMPLETED_WITH_FAILURES');
  });

  it('logs the error for a failed job and a warning for a blocked job', async () => {
    const { store, run } = await setup(emptyTitleOnJ1);
    await run.execute();
    expect(store.logs.find((l) => l.executionId === execOf(store, 'J1').id && l.level === 'ERROR')!.message).toContain('title');
    expect(store.logs.find((l) => l.executionId === execOf(store, 'J3').id)!.level).toBe('WARN');
  });

  it('blocks transitively: a job behind a blocked job is blocked too', async () => {
    const { store, run } = await setup(async (s) => {
      emptyTitleOnJ1(s);
      await s.repos.jobs.insert(
        job('J7', { operationType: 'BUILD_EDITORIAL_REPORT', duration: 1, dependencies: ['J3'] }),
      );
    });
    const result = await run.execute();
    expect(result.blocked.sort()).toEqual(['J3', 'J7']);
    expect(execOf(store, 'J7').error).toContain('J3 BLOCKED');
    expect(execOf(store, 'J7').startedAt).toBeNull();
  });

  it('turns an unexpected exception into a FAILED job instead of aborting the run', async () => {
    const store = new InMemoryStore();
    await seedSample(store.repos);
    const clock = new TickingClock();
    await new GenerateSchedule(store.uow, clock).execute();
    const run = new RunSchedule(store.uow, clock, new InMemoryRunLock(), (type) => {
      if (type === 'COUNT_WORDS') throw new Error('boom');
      return { ok: true };
    });

    const result = await run.execute();
    expect(result.failed).toEqual(['J2']);
    expect(execOf(store, 'J2').error).toBe('Unexpected error: boom');
    expect(result.blocked).toEqual(['J5']);
    expect(execOf(store, 'J4').status).toBe('COMPLETED');
  });
});

describe('RunSchedule: repeated and concurrent requests', () => {
  // Mandatory test 8: repeating an execution request does not execute a completed job again
  it('executes nothing on a repeated run and leaves results untouched', async () => {
    const { store, run } = await setup();
    await run.execute();
    const before = structuredClone(store.executions);
    const logCount = store.logs.length;

    const again = await run.execute();

    expect(again.completed).toEqual([]);
    expect(again.skipped).toHaveLength(6);
    expect(store.executions).toEqual(before); // same outputs, timestamps and durations
    expect(store.logs).toHaveLength(logCount); // no duplicate logs
    expect(store.executions).toHaveLength(6); // no duplicate execution records
    expect(again.schedule.status).toBe('COMPLETED');
  });

  it('does not retry FAILED or BLOCKED jobs on a repeated run', async () => {
    const { store, run } = await setup((s) => {
      s.jobs.get('J1')!.inputData = { title: '', body: 'text' };
    });
    await run.execute();
    const before = structuredClone(store.executions);

    const again = await run.execute();

    expect(again).toMatchObject({ completed: [], failed: [], blocked: [] });
    expect(store.executions).toEqual(before);
  });

  it('runs each job exactly once when two requests arrive at the same time', async () => {
    const { store, run } = await setup();
    const [a, b] = await Promise.all([run.execute(), run.execute()]);

    expect(a.completed.length + b.completed.length).toBe(6);
    expect([a.completed.length, b.completed.length].sort()).toEqual([0, 6]);
    for (const e of store.executions) {
      expect(logsOf(store, e.jobId).filter((m) => m.startsWith('Started'))).toHaveLength(1);
    }
  });
});

describe('RunSchedule: guards', () => {
  it('returns not found when no schedule exists', async () => {
    const store = new InMemoryStore();
    const run = new RunSchedule(store.uow, new TickingClock(), new InMemoryRunLock());
    await expect(run.execute()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns not found for an unknown schedule id', async () => {
    const { run } = await setup();
    await expect(run.execute({ scheduleId: 99 })).rejects.toThrow('Schedule 99 not found');
  });

  it('refuses a stale schedule and runs nothing', async () => {
    const { store, run } = await setup();
    store.jobs.get('J2')!.priority = 1; // edited after generation
    await expect(run.execute()).rejects.toBeInstanceOf(ConflictError);
    await expect(run.execute()).rejects.toThrow('stale');
    expect(store.executions.every((e) => e.status === 'SCHEDULED')).toBe(true);
    expect(store.logs).toHaveLength(0);
  });

  it('can run a specific schedule by id', async () => {
    const { store, run } = await setup();
    const result = await run.execute({ scheduleId: store.schedules[0]!.id });
    expect(result.completed).toHaveLength(6);
  });

  it('leaves a job SCHEDULED when a dependency is neither completed nor failed', async () => {
    const { store, run } = await setup();
    // simulate a crashed earlier run that left J1 stuck in RUNNING
    execOf(store, 'J1').status = 'RUNNING';
    const result = await run.execute();
    expect(result.skipped).toContain('J1');
    expect(result.skipped).toContain('J3');
    expect(execOf(store, 'J3').status).toBe('SCHEDULED');
    expect(result.completed).toEqual(['J2', 'J6', 'J4', 'J5']);
  });
});

describe('execution history', () => {
  it('lists executions newest first with job, machine and timing', async () => {
    const { store, run } = await setup();
    await run.execute();
    const list = await new ListExecutions(store.uow).execute();

    expect(list).toHaveLength(6);
    expect(list[0]!.id).toBeGreaterThan(list[5]!.id);
    const j3 = list.find((e) => e.jobId === 'J3')!;
    expect(j3).toMatchObject({ jobName: 'Generate summary', operationType: 'GENERATE_SUMMARY', machineId: 'M2', scheduledStart: 2, scheduledEnd: 4, status: 'COMPLETED' });
    expect(j3.durationMs).not.toBeNull();
  });

  it('keeps history from earlier schedules and can filter by schedule', async () => {
    const { store, run, clock } = await setup();
    await run.execute();
    await new GenerateSchedule(store.uow, clock).execute();

    const queries = new ListExecutions(store.uow);
    expect(await queries.execute()).toHaveLength(12);
    const first = await queries.execute({ scheduleId: store.schedules[0]!.id });
    expect(first).toHaveLength(6);
    expect(first.every((e) => e.status === 'COMPLETED')).toBe(true);
  });

  it('returns one execution with its logs in order', async () => {
    const { store, run } = await setup();
    await run.execute();
    const detail = await new GetExecution(store.uow).execute(execOf(store, 'J1').id);
    expect(detail.jobId).toBe('J1');
    expect(detail.logs.map((l) => l.level)).toEqual(['INFO', 'INFO']);
    expect(detail.logs[0]!.message).toContain('Started');
    expect(detail.output).toMatchObject({ valid: true });
  });

  it('returns not found for an unknown execution', async () => {
    const { store } = await setup();
    await expect(new GetExecution(store.uow).execute(9999)).rejects.toBeInstanceOf(NotFoundError);
  });
});
