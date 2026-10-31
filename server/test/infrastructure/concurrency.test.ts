import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RunSchedule } from '../../src/application/use-cases/run-schedule.ts';
import { createUseCases } from '../../src/composition.ts';
import { PostgresRunLock } from '../../src/infrastructure/postgres/run-lock.ts';
import { PostgresUnitOfWork } from '../../src/infrastructure/postgres/unit-of-work.ts';
import { SystemClock } from '../../src/infrastructure/system-clock.ts';
import { createTestPool, truncateAll } from '../db.ts';

const pool = createTestPool();

beforeEach(() => truncateAll(pool));
afterAll(() => pool.end());

const startedLogsPerExecution = async () =>
  (
    await pool.query<{ execution_id: number; n: number }>(
      `SELECT execution_id, count(*)::int AS n FROM execution_logs
        WHERE message LIKE 'Started%' GROUP BY execution_id`,
    )
  ).rows;

const count = async (table: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

async function generated() {
  const uc = createUseCases(pool);
  await uc.resetSampleData.execute();
  await uc.generateSchedule.execute();
  return uc;
}

describe('PostgresRunLock', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('serializes callers that use the same key', async () => {
    const lock = new PostgresRunLock(pool);
    const events: string[] = [];
    const task = (name: string) => () =>
      lock.withLock(7, async () => {
        events.push(`${name} start`);
        await sleep(80);
        events.push(`${name} end`);
      });

    await Promise.all([task('a')(), task('b')()]);

    // never interleaved: one finishes before the other starts
    expect(events[0]!.slice(-5)).toBe('start');
    expect(events[1]).toBe(`${events[0]!.split(' ')[0]} end`);
    expect(events).toHaveLength(4);
  });

  it('lets callers with different keys run at the same time', async () => {
    const lock = new PostgresRunLock(pool);
    const events: string[] = [];
    const task = (key: number, name: string) =>
      lock.withLock(key, async () => {
        events.push(`${name} start`);
        await sleep(80);
        events.push(`${name} end`);
      });

    await Promise.all([task(1, 'a'), task(2, 'b')]);

    expect(events.slice(0, 2).sort()).toEqual(['a start', 'b start']);
  });

  it('releases the lock when the work throws', async () => {
    const lock = new PostgresRunLock(pool);
    await expect(lock.withLock(9, async () => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(lock.withLock(9, async () => 'acquired again')).resolves.toBe('acquired again');
  });
});

describe('concurrent schedule runs (mandatory test 8, concurrent variant)', () => {
  it('executes each job exactly once when two runs start together', async () => {
    const uc = await generated();
    const [a, b] = await Promise.all([uc.runSchedule.execute(), uc.runSchedule.execute()]);

    expect([a.completed.length, b.completed.length].sort()).toEqual([0, 6]);
    expect(await count('job_executions')).toBe(6);
    expect(await count('execution_logs')).toBe(12); // one start + one completion per job, no duplicates
    const started = await startedLogsPerExecution();
    expect(started).toHaveLength(6);
    expect(started.every((s) => s.n === 1)).toBe(true);
    expect((await uc.getLatestSchedule.execute()).status).toBe('COMPLETED');
  });

  it('still executes each job exactly once under five simultaneous requests', async () => {
    const uc = await generated();
    const results = await Promise.all(Array.from({ length: 5 }, () => uc.runSchedule.execute()));

    expect(results.reduce((sum, r) => sum + r.completed.length, 0)).toBe(6);
    expect(await count('execution_logs')).toBe(12);
    expect((await startedLogsPerExecution()).every((s) => s.n === 1)).toBe(true);
  });

  it('never runs a job twice even if the lock were missing (compare-and-set is the second line of defence)', async () => {
    const uc = await generated();
    const noLock = { withLock: <T>(_key: number, work: () => Promise<T>) => work() };
    const unlocked = new RunSchedule(new PostgresUnitOfWork(pool), new SystemClock(), noLock);

    await Promise.allSettled([unlocked.execute(), unlocked.execute(), unlocked.execute()]);

    const started = await startedLogsPerExecution();
    expect(started.every((s) => s.n === 1)).toBe(true); // no job started twice
    expect(await count('job_executions')).toBe(6);
    // a loser may have aborted with a conflict; a normal locked run finishes whatever is left
    await uc.runSchedule.execute();
    expect((await uc.getLatestSchedule.execute()).status).toBe('COMPLETED');
    expect((await startedLogsPerExecution()).every((s) => s.n === 1)).toBe(true);
  });
});
