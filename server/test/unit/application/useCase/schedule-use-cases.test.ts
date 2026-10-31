import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateSchedule } from '../../../../src/application/useCase/generate-schedule.ts';
import { GetLatestSchedule } from '../../../../src/application/useCase/get-latest-schedule.ts';
import { UpdateJob } from '../../../../src/application/useCase/update-job.ts';
import { GraphError, LimitExceededError, NotFoundError } from '../../../../src/application/errors/errors.ts';
import { job } from '../../../fixtures/fixtures.ts';
import { InMemoryStore, TickingClock } from '../../../fixtures/in-memory.ts';
import { seedSample } from '../../../fixtures/seed.ts';

let store: InMemoryStore;
let generate: GenerateSchedule;
let latest: GetLatestSchedule;
let update: UpdateJob;

beforeEach(async () => {
  store = new InMemoryStore();
  generate = new GenerateSchedule(store.uow, new TickingClock());
  latest = new GetLatestSchedule(store.uow);
  update = new UpdateJob(store.uow);
});

describe('GenerateSchedule', () => {
  it('computes and stores the optimal schedule for the sample data', async () => {
    await seedSample(store.repos);
    const schedule = await generate.execute();

    expect(schedule).toMatchObject({ totalPriority: 45, scheduledCount: 6, makespan: 7, stale: false });
    expect(schedule.assignments.map((a) => [a.jobId, a.machineId, a.start])).toEqual([
      ['J1', 'M2', 0],
      ['J2', 'M1', 0],
      ['J3', 'M2', 2],
      ['J4', 'M2', 4],
      ['J5', 'M1', 4],
      ['J6', 'M1', 2],
    ]);
    expect(schedule.exclusions).toEqual([]);
  });

  it('creates a SCHEDULED execution for each assigned job and does not treat the schedule as completed', async () => {
    await seedSample(store.repos);
    const schedule = await generate.execute();

    expect(schedule.status).toBe('GENERATED');
    expect(schedule.executions).toHaveLength(6);
    expect(schedule.executions.every((e) => e.status === 'SCHEDULED')).toBe(true);
    expect(schedule.executions.map((e) => e.jobId)).toEqual(['J1', 'J2', 'J3', 'J6', 'J4', 'J5']); // by scheduled start, then id
    expect(schedule.executions[0]).toMatchObject({ jobName: 'Validate article', machineId: 'M2', scheduledStart: 0, scheduledEnd: 2 });
  });

  it('stores and returns exclusions with reasons', async () => {
    await seedSample(store.repos);
    await store.repos.jobs.insert(job('J7', { releaseTime: 6, duration: 4, deadline: 8, eligibleMachines: ['M1'] }));
    const schedule = await generate.execute();

    expect(schedule.scheduledCount).toBe(6);
    expect(schedule.exclusions).toHaveLength(1);
    expect(schedule.exclusions[0]).toMatchObject({ jobId: 'J7', code: 'WINDOW_TOO_SMALL' });
  });

  it('is deterministic: unchanged data yields identical assignments', async () => {
    await seedSample(store.repos);
    const first = await generate.execute();
    const second = await generate.execute();
    expect(second.id).not.toBe(first.id);
    expect(second.assignments).toEqual(first.assignments);
    expect(second.totalPriority).toBe(first.totalPriority);
  });

  it('rejects more than 8 jobs and stores no schedule', async () => {
    await seedSample(store.repos);
    await store.repos.jobs.insert(job('J7'));
    await store.repos.jobs.insert(job('J8'));
    await store.repos.jobs.insert(job('J9'));

    await expect(generate.execute()).rejects.toBeInstanceOf(LimitExceededError);
    await expect(generate.execute()).rejects.toThrow('at most 8');
    expect(store.schedules).toHaveLength(0);
  });

  it('rejects an invalid stored graph and stores no schedule', async () => {
    await store.repos.machines.insertMany([{ id: 'M1', name: 'Machine 1', status: 'AVAILABLE' }]);
    await store.repos.jobs.insert(job('J1', { dependencies: ['J2'] }));
    await store.repos.jobs.insert(job('J2', { dependencies: ['J1'] }));

    await expect(generate.execute()).rejects.toBeInstanceOf(GraphError);
    expect(store.schedules).toHaveLength(0);
  });

  it('records the solver stats with the schedule', async () => {
    await seedSample(store.repos);
    const schedule = await generate.execute();
    expect(schedule.solverStats).toMatchObject({ subsetsConsidered: expect.any(Number), nodesVisited: expect.any(Number) });
  });
});

describe('GetLatestSchedule', () => {
  it('returns not found before any schedule exists', async () => {
    await expect(latest.execute()).rejects.toBeInstanceOf(NotFoundError);
    await expect(latest.execute()).rejects.toThrow('No schedule has been generated yet');
  });

  it('returns the most recent schedule', async () => {
    await seedSample(store.repos);
    await generate.execute();
    const second = await generate.execute();
    expect((await latest.execute()).id).toBe(second.id);
  });

  it('does not expose the input snapshot or fingerprint', async () => {
    await seedSample(store.repos);
    await generate.execute();
    const view = await latest.execute();
    expect(view).not.toHaveProperty('snapshot');
    expect(view).not.toHaveProperty('fingerprint');
  });
});

describe('stale schedule detection', () => {
  const sampleBody = (id: string) => {
    const j = store.jobs.get(id)!;
    return { ...structuredClone(j) };
  };

  beforeEach(() => seedSample(store.repos));

  it('is fresh right after generation', async () => {
    await generate.execute();
    expect((await latest.execute()).stale).toBe(false);
  });

  it('turns stale when a job is edited, and fresh again after regenerating', async () => {
    await generate.execute();
    await update.execute('J1', { ...sampleBody('J1'), priority: 3 });
    expect((await latest.execute()).stale).toBe(true);

    await generate.execute();
    expect((await latest.execute()).stale).toBe(false);
  });

  it('turns stale when only a job input changes', async () => {
    await generate.execute();
    await update.execute('J2', { ...sampleBody('J2'), inputData: { body: 'different text' } });
    expect((await latest.execute()).stale).toBe(true);
  });

  it('ignores a no-op edit that changes nothing', async () => {
    await generate.execute();
    await update.execute('J1', sampleBody('J1'));
    expect((await latest.execute()).stale).toBe(false);
  });

  it('turns stale when a new job is added', async () => {
    await generate.execute();
    await store.repos.jobs.insert(job('J7'));
    expect((await latest.execute()).stale).toBe(true);
  });

  it('turns stale when a machine becomes unavailable', async () => {
    await generate.execute();
    store.machines.get('M2')!.status = 'UNAVAILABLE';
    expect((await latest.execute()).stale).toBe(true);
  });
});
