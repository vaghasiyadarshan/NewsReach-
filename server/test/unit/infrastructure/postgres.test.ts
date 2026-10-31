import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUseCases } from '../../../src/infrastructure/di/composition.ts';
import { SAMPLE_JOBS, SAMPLE_MACHINES } from '../../../src/application/constants/sample-data.ts';
import { snapshotOf, computeFingerprint } from '../../../src/application/helper/fingerprint.ts';
import { ConflictError, InvalidTransitionError, NotFoundError } from '../../../src/application/errors/errors.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/repositories/unit-of-work.ts';
import { job } from '../../fixtures/fixtures.ts';
import { createTestPool, truncateAll } from '../../fixtures/db.ts';
import { TickingClock } from '../../fixtures/in-memory.ts';

const pool = createTestPool();
const uow = new PostgresUnitOfWork(pool);

beforeEach(() => truncateAll(pool));
afterAll(() => pool.end());

const count = async (table: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

const seed = () =>
  uow.run(async (repos) => {
    await repos.machines.insertMany(structuredClone([...SAMPLE_MACHINES]));
    for (const j of SAMPLE_JOBS) await repos.jobs.insert(structuredClone(j));
  });

describe('unit of work', () => {
  it('commits everything written inside it', async () => {
    await seed();
    expect(await count('machines')).toBe(2);
    expect(await count('jobs')).toBe(6);
    expect(await count('job_dependencies')).toBe(2);
  });

  it('rolls back everything when the work throws', async () => {
    await expect(
      uow.run(async (repos) => {
        await repos.machines.insertMany([{ id: 'M1', name: 'Machine 1', status: 'AVAILABLE' }]);
        await repos.jobs.insert(job('J1', { eligibleMachines: ['M1'] }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await count('machines')).toBe(0);
    expect(await count('jobs')).toBe(0);
    expect(await count('job_eligible_machines')).toBe(0);
  });

  it('releases its connection even after a rollback', async () => {
    for (let i = 0; i < 25; i++) {
      await uow.run(async () => {
        throw new Error('fail');
      }).catch(() => undefined);
    }
    await expect(seed()).resolves.toBeUndefined(); // would hang if connections leaked
  });
});

describe('schedule creation is all-or-nothing', () => {
  it('stores no schedule, assignments or executions when a later insert fails', async () => {
    await seed();
    const snapshot = snapshotOf(SAMPLE_JOBS, SAMPLE_MACHINES);
    const draft = {
      snapshot,
      fingerprint: computeFingerprint(snapshot),
      solverStats: {},
      createdAt: new Date(),
      result: {
        // the second assignment violates CHECK (end_slot > start_slot) after the schedule row and
        // the first rows were already written inside the same transaction
        assignments: [
          { jobId: 'J1', machineId: 'M1', start: 0, end: 2 },
          { jobId: 'J2', machineId: 'M1', start: 4, end: 4 },
        ],
        exclusions: [],
        totalPriority: 18,
        scheduledCount: 2,
        makespan: 4,
      },
    };

    // it must fail on that constraint specifically, after the schedule row was inserted
    await expect(uow.run((repos) => repos.schedules.create(draft))).rejects.toThrow(/assignment_interval/);

    expect(await count('schedules')).toBe(0);
    expect(await count('schedule_assignments')).toBe(0);
    expect(await count('job_executions')).toBe(0);
  });

  it('GenerateSchedule leaves nothing behind when the data is invalid', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    for (const id of ['J7', 'J8', 'J9']) await uc.createJob.execute({ ...validBody(id) });

    await expect(uc.generateSchedule.execute()).rejects.toThrow('at most 8');
    expect(await count('schedules')).toBe(0);
  });
});

const validBody = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Job ${id}`,
  operationType: 'COUNT_WORDS',
  duration: 1,
  releaseTime: 0,
  deadline: 12,
  priority: 1,
  eligibleMachines: ['M1'],
  dependencies: [],
  inputData: { body: 'a b c' },
  ...overrides,
});

describe('repositories', () => {
  it('round-trips a job with its machines, dependencies and JSON input', async () => {
    await seed();
    const j3 = await uow.run((repos) => repos.jobs.findById('J3'));
    expect(j3).toEqual(SAMPLE_JOBS.find((j) => j.id === 'J3'));
  });

  it('replaces eligible machines and dependencies on update', async () => {
    await seed();
    const changed = { ...structuredClone(SAMPLE_JOBS[2]!), eligibleMachines: ['M2'], dependencies: [], priority: 2, inputData: { body: 'new' } };
    await uow.run((repos) => repos.jobs.update(changed));
    expect(await uow.run((repos) => repos.jobs.findById('J3'))).toEqual(changed);
    expect(await count('job_dependencies')).toBe(1); // only J5 -> J2 remains
  });

  it('lists jobs in plain code-unit order, not locale order', async () => {
    await uow.run(async (repos) => {
      await repos.machines.insertMany([{ id: 'M1', name: 'M', status: 'AVAILABLE' }]);
      for (const id of ['J2', 'J10', 'J1']) await repos.jobs.insert(job(id, { eligibleMachines: ['M1'] }));
    });
    expect((await uow.run((repos) => repos.jobs.list())).map((j) => j.id)).toEqual(['J1', 'J10', 'J2']);
  });

  it('maps a duplicate id to a conflict', async () => {
    await seed();
    await expect(uow.run((repos) => repos.jobs.insert(structuredClone(SAMPLE_JOBS[0]!)))).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a vanished machine reference to a conflict', async () => {
    await seed();
    await expect(
      uow.run((repos) => repos.jobs.insert(job('J7', { eligibleMachines: ['M9'] }))),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await uow.run((repos) => repos.jobs.findById('J7'))).toBeNull();
  });

  it('returns numeric ids for BIGSERIAL columns', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    const schedule = await uc.generateSchedule.execute();
    expect(typeof schedule.id).toBe('number');
    expect(typeof schedule.executions[0]!.id).toBe('number');
  });
});

describe('execution state transitions', () => {
  const firstExecutionId = async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    const schedule = await uc.generateSchedule.execute();
    return schedule.executions[0]!.id;
  };

  it('lets only one of two competing writers move an execution out of SCHEDULED', async () => {
    const id = await firstExecutionId();
    const attempts = await Promise.allSettled([
      uow.run((r) => r.executions.transition(id, 'SCHEDULED', 'RUNNING', { startedAt: new Date() })),
      uow.run((r) => r.executions.transition(id, 'SCHEDULED', 'RUNNING', { startedAt: new Date() })),
    ]);
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find((a) => a.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
  });

  it('refuses COMPLETED to RUNNING and keeps the stored state', async () => {
    const id = await firstExecutionId();
    await uow.run((r) => r.executions.transition(id, 'SCHEDULED', 'RUNNING', { startedAt: new Date() }));
    await uow.run((r) => r.executions.transition(id, 'RUNNING', 'COMPLETED', { completedAt: new Date(), durationMs: 3, output: { ok: true } }));

    await expect(uow.run((r) => r.executions.transition(id, 'COMPLETED', 'RUNNING'))).rejects.toBeInstanceOf(InvalidTransitionError);

    const stored = await uow.run((r) => r.executions.findById(id));
    expect(stored).toMatchObject({ status: 'COMPLETED', durationMs: 3, output: { ok: true } });
  });

  it('reports an unknown execution as not found', async () => {
    await expect(uow.run((r) => r.executions.transition(99999, 'SCHEDULED', 'RUNNING'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes a state change and its log atomically', async () => {
    const id = await firstExecutionId();
    await expect(
      uow.run(async (r) => {
        await r.executions.transition(id, 'SCHEDULED', 'RUNNING', { startedAt: new Date() });
        await r.executions.addLog(id, { level: 'INFO', message: 'started', ts: new Date() });
        throw new Error('crash before commit');
      }),
    ).rejects.toThrow('crash');

    expect((await uow.run((r) => r.executions.findById(id)))!.status).toBe('SCHEDULED');
    expect(await count('execution_logs')).toBe(0);
  });
});

describe('end to end on PostgreSQL', () => {
  it('seeds, schedules, runs and records everything', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();

    const schedule = await uc.generateSchedule.execute();
    expect(schedule).toMatchObject({ totalPriority: 45, scheduledCount: 6, makespan: 7, status: 'GENERATED' });

    const run = await uc.runSchedule.execute();
    expect(run.completed).toEqual(['J1', 'J2', 'J3', 'J6', 'J4', 'J5']);
    expect(run.schedule.status).toBe('COMPLETED');

    const latest = await uc.getLatestSchedule.execute();
    expect(latest).toMatchObject({ id: schedule.id, status: 'COMPLETED', stale: false });
    const j5 = latest.executions.find((e) => e.jobId === 'J5')!;
    expect((j5.output as { results: Record<string, unknown> }).results.J2).toEqual(latest.executions.find((e) => e.jobId === 'J2')!.output);

    const detail = await uc.getExecution.execute(j5.id);
    expect(detail.logs.map((l) => l.level)).toEqual(['INFO', 'INFO']);
  });

  // Mandatory test 8 against the real database
  it('does not execute again on a repeated run', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    await uc.generateSchedule.execute();
    await uc.runSchedule.execute();
    const before = await pool.query('SELECT id, status, started_at, completed_at, duration_ms, output FROM job_executions ORDER BY id');

    const again = await uc.runSchedule.execute();

    expect(again.completed).toEqual([]);
    expect(again.skipped).toHaveLength(6);
    expect(await pool.query('SELECT id, status, started_at, completed_at, duration_ms, output FROM job_executions ORDER BY id')).toMatchObject({ rows: before.rows });
    expect(await count('job_executions')).toBe(6);
    expect(await count('execution_logs')).toBe(12);
  });

  // Mandatory test 7 against the real database
  it('blocks the dependent of a failed job', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    const j1 = SAMPLE_JOBS[0]!;
    await uc.updateJob.execute('J1', { ...j1, inputData: { title: '', body: 'text' } });
    await uc.generateSchedule.execute();

    const run = await uc.runSchedule.execute();
    expect(run).toMatchObject({ failed: ['J1'], blocked: ['J3'] });

    const dash = await uc.getDashboard.execute();
    expect(dash.overview).toEqual({ total: 6, scheduled: 0, running: 0, completed: 4, failed: 1, blocked: 1, unscheduled: 0 });
    expect(dash.jobs.find((j) => j.id === 'J3')).toMatchObject({ status: 'BLOCKED', startedAt: null });
  });

  it('keeps execution history across schedules', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    await uc.generateSchedule.execute();
    await uc.runSchedule.execute();
    await uc.generateSchedule.execute();
    expect(await uc.listExecutions.execute()).toHaveLength(12);
  });

  it('refuses to run a stale schedule', async () => {
    const uc = createUseCases(pool, new TickingClock());
    await uc.resetSampleData.execute();
    await uc.generateSchedule.execute();
    await uc.updateJob.execute('J2', { ...SAMPLE_JOBS[1]!, priority: 1 });

    await expect(uc.runSchedule.execute()).rejects.toBeInstanceOf(ConflictError);
    expect(await count('execution_logs')).toBe(0);
  });
});
