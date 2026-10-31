import { describe, expect, it } from 'vitest';
import { GenerateSchedule } from '../../src/application/use-cases/generate-schedule.ts';
import { GetDashboard } from '../../src/application/use-cases/get-dashboard.ts';
import { ResetSampleData } from '../../src/application/use-cases/reset-sample-data.ts';
import { RunSchedule } from '../../src/application/use-cases/run-schedule.ts';
import { job } from '../domain/fixtures.ts';
import { InMemoryRunLock, InMemoryStore, TickingClock } from '../support/in-memory.ts';
import { seedSample } from '../support/seed.ts';

async function setup() {
  const store = new InMemoryStore();
  await seedSample(store.repos);
  const clock = new TickingClock();
  return {
    store,
    dashboard: new GetDashboard(store.uow),
    generate: new GenerateSchedule(store.uow, clock),
    run: new RunSchedule(store.uow, clock, new InMemoryRunLock()),
  };
}

describe('GetDashboard', () => {
  it('shows an empty state before any schedule: all jobs unscheduled, idle machines', async () => {
    const { dashboard } = await setup();
    const view = await dashboard.execute();

    expect(view.schedule).toBeNull();
    expect(view.overview).toEqual({ total: 6, scheduled: 0, running: 0, completed: 0, failed: 0, blocked: 0, unscheduled: 6 });
    expect(view.machines.map((m) => [m.id, m.busySlots, m.workloadPercent])).toEqual([['M1', 0, 0], ['M2', 0, 0]]);
    expect(view.jobs.every((j) => j.status === 'PENDING' && j.machineId === null)).toBe(true);
  });

  it('shows the scheduler summary, machine timelines and workload after generation', async () => {
    const { dashboard, generate } = await setup();
    await generate.execute();
    const view = await dashboard.execute();

    expect(view.schedule).toMatchObject({ totalPriority: 45, scheduledCount: 6, makespan: 7, status: 'GENERATED', stale: false, exclusions: [] });
    expect(view.overview).toMatchObject({ total: 6, scheduled: 6, unscheduled: 0, completed: 0 });

    const [m1, m2] = view.machines;
    expect(m1!.jobs.map((j) => [j.jobId, j.start, j.end])).toEqual([['J2', 0, 2], ['J6', 2, 3], ['J5', 4, 6]]);
    expect(m1).toMatchObject({ busySlots: 5, horizon: 12, workloadPercent: 42 });
    expect(m2!.jobs.map((j) => j.jobId)).toEqual(['J1', 'J3', 'J4']);
    expect(m2).toMatchObject({ busySlots: 7, workloadPercent: 58 });
  });

  it('shows a machine with no assigned jobs as idle', async () => {
    const { store, dashboard, generate } = await setup();
    await store.repos.machines.insertMany([{ id: 'M3', name: 'Processing Machine 3', status: 'AVAILABLE' }]);
    await generate.execute();
    const m3 = (await dashboard.execute()).machines.find((m) => m.id === 'M3')!;
    expect(m3).toMatchObject({ jobs: [], busySlots: 0, workloadPercent: 0 });
  });

  it('counts failed and blocked jobs after a run, and the counts match the job list', async () => {
    const { store, dashboard, generate, run } = await setup();
    store.jobs.get('J1')!.inputData = { title: '', body: 'text' };
    await generate.execute();
    await run.execute();
    const view = await dashboard.execute();

    expect(view.overview).toEqual({ total: 6, scheduled: 0, running: 0, completed: 4, failed: 1, blocked: 1, unscheduled: 0 });
    for (const key of ['completed', 'failed', 'blocked'] as const) {
      expect(view.jobs.filter((j) => j.status === key.toUpperCase()).length).toBe(view.overview[key]);
    }
    const o = view.overview;
    expect(o.scheduled + o.running + o.completed + o.failed + o.blocked + o.unscheduled).toBe(o.total);
    expect(view.schedule!.status).toBe('COMPLETED_WITH_FAILURES');
  });

  it('gives each job its execution details, error and actual times', async () => {
    const { store, dashboard, generate, run } = await setup();
    store.jobs.get('J1')!.inputData = { title: '', body: 'text' };
    await generate.execute();
    await run.execute();
    const rows = new Map((await dashboard.execute()).jobs.map((j) => [j.id, j]));

    expect(rows.get('J1')).toMatchObject({ name: 'Validate article', operationType: 'VALIDATE_ARTICLE', status: 'FAILED', error: 'Missing or empty field: title', machineId: 'M2', scheduledStart: 0, scheduledEnd: 2 });
    expect(rows.get('J1')!.startedAt).toBeInstanceOf(Date);
    expect(rows.get('J3')).toMatchObject({ status: 'BLOCKED', startedAt: null, completedAt: null, output: null });
    expect(rows.get('J3')!.error).toContain('J1 FAILED');
    expect(rows.get('J2')).toMatchObject({ status: 'COMPLETED', error: null });
    expect(rows.get('J2')!.output).toMatchObject({ wordCount: expect.any(Number) });
  });

  it('shows scheduled but not yet run jobs without actual times', async () => {
    const { dashboard, generate } = await setup();
    await generate.execute();
    const row = (await dashboard.execute()).jobs[0]!;
    expect(row).toMatchObject({ status: 'SCHEDULED', startedAt: null, completedAt: null, output: null, error: null });
  });

  it('lists excluded jobs with their reasons and counts them as unscheduled', async () => {
    const { store, dashboard, generate } = await setup();
    await store.repos.jobs.insert(job('J7', { releaseTime: 6, duration: 4, deadline: 8, eligibleMachines: ['M1'] }));
    await generate.execute();
    const view = await dashboard.execute();

    expect(view.schedule!.exclusions).toHaveLength(1);
    expect(view.schedule!.exclusions[0]).toMatchObject({ jobId: 'J7', code: 'WINDOW_TOO_SMALL' });
    expect(view.overview).toMatchObject({ total: 7, scheduled: 6, unscheduled: 1 });
    const j7 = view.jobs.find((j) => j.id === 'J7')!;
    expect(j7.status).toBe('UNSCHEDULED');
    expect(j7.exclusionReason).toContain('Earliest possible finish');
  });

  it('flags the schedule as stale after a change and counts a new job as unscheduled', async () => {
    const { store, dashboard, generate } = await setup();
    await generate.execute();
    await store.repos.jobs.insert(job('J7'));
    const view = await dashboard.execute();
    expect(view.schedule!.stale).toBe(true);
    expect(view.jobs.find((j) => j.id === 'J7')!.status).toBe('PENDING');
    expect(view.overview.unscheduled).toBe(1);
  });
});

describe('ResetSampleData', () => {
  it('loads machines M1, M2 and jobs J1 to J6 with the brief parameters', async () => {
    const store = new InMemoryStore();
    const result = await new ResetSampleData(store.uow).execute();

    expect(result).toEqual({ machines: 2, jobs: 6 });
    expect([...store.machines.values()].map((m) => [m.id, m.name, m.status])).toEqual([
      ['M1', 'Processing Machine 1', 'AVAILABLE'],
      ['M2', 'Processing Machine 2', 'AVAILABLE'],
    ]);
    const j3 = store.jobs.get('J3')!;
    expect(j3).toMatchObject({ operationType: 'GENERATE_SUMMARY', duration: 2, releaseTime: 2, deadline: 8, priority: 9, eligibleMachines: ['M1', 'M2'], dependencies: ['J1'] });
    expect(j3.inputData).toMatchObject({ summary_words: 20 });
    expect(store.jobs.get('J5')!.dependencies).toEqual(['J2']);
    expect([...store.jobs.keys()]).toEqual(['J1', 'J2', 'J3', 'J4', 'J5', 'J6']);
  });

  it('clears earlier jobs, schedules and executions', async () => {
    const { store, generate, run } = await setup();
    await store.repos.jobs.insert(job('J9'));
    await generate.execute();
    await run.execute().catch(() => undefined); // stale on purpose; leaves a schedule behind

    await new ResetSampleData(store.uow).execute();

    expect(store.jobs.has('J9')).toBe(false);
    expect(store.schedules).toHaveLength(0);
    expect(store.executions).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
  });

  it('can be run repeatedly and the result is schedulable', async () => {
    const store = new InMemoryStore();
    const reset = new ResetSampleData(store.uow);
    await reset.execute();
    await reset.execute();
    const schedule = await new GenerateSchedule(store.uow, new TickingClock()).execute();
    expect(schedule.totalPriority).toBe(45);
  });
});
