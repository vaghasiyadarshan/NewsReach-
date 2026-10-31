// The ten scenarios the brief requires the solution to demonstrate, each driven end to end through
// the public HTTP API against a real PostgreSQL database. Deeper unit-level coverage of each rule
// is listed next to every scenario in README.md.
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/infrastructure/webserver/app.ts';
import { SAMPLE_JOBS } from '../../../src/application/constants/sample-data.ts';
import { createUseCases } from '../../../src/infrastructure/di/composition.ts';
import { createTestPool, truncateAll } from '../../fixtures/db.ts';
import { TickingClock } from '../../fixtures/in-memory.ts';

const pool = createTestPool();
const app = createApp(createUseCases(pool, new TickingClock()));

beforeEach(async () => {
  await truncateAll(pool);
  await request(app).post('/api/dev/reset-sample').expect(200);
});
afterAll(() => pool.end());

type Assignment = { jobId: string; machineId: string; start: number; end: number };
type Execution = { jobId: string; status: string; startedAt: string | null; completedAt: string | null; error: string | null };

const generate = async () => (await request(app).post('/api/schedules/generate').expect(201)).body;
const run = async () => (await request(app).post('/api/schedules/run').expect(200)).body;
const at = (assignments: Assignment[], id: string) => assignments.find((a) => a.jobId === id)!;
const overlaps = (a: Assignment, b: Assignment) => a.start < b.end && b.start < a.end;

const jobBody = (id: string, overrides: Record<string, unknown> = {}) => ({
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

describe('mandatory scenarios', () => {
  it('1. two independent jobs execute simultaneously on different machines', async () => {
    const schedule = await generate();
    const [j1, j2] = [at(schedule.assignments, 'J1'), at(schedule.assignments, 'J2')];
    expect(overlaps(j1, j2)).toBe(true); // same time window
    expect(j1.machineId).not.toBe(j2.machineId); // different machines
    expect([j1.start, j2.start]).toEqual([0, 0]);

    const result = await run();
    expect(result.completed).toEqual(expect.arrayContaining(['J1', 'J2']));
  });

  it('2. two jobs assigned to the same machine never overlap', async () => {
    const { assignments } = await generate();
    const byMachine = new Map<string, Assignment[]>();
    for (const a of assignments as Assignment[]) byMachine.set(a.machineId, [...(byMachine.get(a.machineId) ?? []), a]);

    expect(byMachine.get('M1')!.length).toBeGreaterThan(1);
    for (const jobs of byMachine.values()) {
      for (const x of jobs) for (const y of jobs) if (x.jobId < y.jobId) expect(overlaps(x, y), `${x.jobId}/${y.jobId}`).toBe(false);
    }
  });

  it('3. a dependent job starts only after its dependency completes', async () => {
    const schedule = await generate();
    expect(at(schedule.assignments, 'J3').start).toBeGreaterThanOrEqual(at(schedule.assignments, 'J1').end);
    expect(at(schedule.assignments, 'J5').start).toBeGreaterThanOrEqual(at(schedule.assignments, 'J2').end);

    const executions = (await run()).schedule.executions as Execution[];
    const ex = (id: string) => executions.find((e) => e.jobId === id)!;
    expect(new Date(ex('J3').startedAt!).getTime()).toBeGreaterThanOrEqual(new Date(ex('J1').completedAt!).getTime());
    expect(new Date(ex('J5').startedAt!).getTime()).toBeGreaterThanOrEqual(new Date(ex('J2').completedAt!).getTime());
  });

  it('4. a job that cannot meet its deadline is excluded', async () => {
    // release 6 + duration 4 = earliest finish 10, but the deadline is 8
    await request(app).post('/api/jobs').send(jobBody('J7', { releaseTime: 6, duration: 4, deadline: 8 })).expect(201);
    const schedule = await generate();

    expect(schedule.assignments.map((a: Assignment) => a.jobId)).not.toContain('J7');
    expect(schedule.exclusions).toEqual([
      expect.objectContaining({ jobId: 'J7', code: 'WINDOW_TOO_SMALL', reason: expect.stringContaining('slot 10') }),
    ]);
    expect(schedule.scheduledCount).toBe(6); // the rest is unaffected
  });

  it('5. a circular dependency is rejected', async () => {
    // J3 already depends on J1; making J1 depend on J3 would close a cycle
    const res = await request(app).put('/api/jobs/J1').send({ ...SAMPLE_JOBS[0], dependencies: ['J3'] }).expect(422);
    expect(res.body.error.code).toBe('CIRCULAR_DEPENDENCY');
    expect(res.body.error.details.cycle).toEqual(['J1', 'J3', 'J1']);
    expect((await request(app).get('/api/jobs/J1')).body.dependencies).toEqual([]); // unchanged

    // and a job cannot depend on itself
    await request(app).post('/api/jobs').send(jobBody('J8', { dependencies: ['J8'] })).expect(422);
  });

  it('6. a missing dependency reference is rejected', async () => {
    const res = await request(app).post('/api/jobs').send(jobBody('J7', { dependencies: ['J99'] })).expect(422);
    expect(res.body.error).toMatchObject({ code: 'MISSING_REFERENCE', details: { kind: 'dependency', ids: ['J99'] } });
    await request(app).get('/api/jobs/J7').expect(404); // nothing was stored
  });

  it('7. if a dependency fails, its dependent job becomes BLOCKED', async () => {
    await request(app).put('/api/jobs/J1').send({ ...SAMPLE_JOBS[0], inputData: { title: '', body: 'text' } }).expect(200);
    await generate();
    const result = await run();

    expect(result.failed).toEqual(['J1']);
    expect(result.blocked).toEqual(['J3']);
    const ex = (id: string) => (result.schedule.executions as Execution[]).find((e) => e.jobId === id)!;
    expect(ex('J1').status).toBe('FAILED');
    expect(ex('J3')).toMatchObject({ status: 'BLOCKED', startedAt: null }); // never executed
    expect(ex('J3').error).toContain('J1');
  });

  it('8. repeating an execution request does not execute a completed job again', async () => {
    await generate();
    const first = await run();
    const second = await run();

    expect(first.completed).toHaveLength(6);
    expect(second.completed).toEqual([]);
    expect(second.skipped).toHaveLength(6);
    expect(second.schedule.executions).toEqual(first.schedule.executions); // same outputs and timestamps
    expect(await request(app).get('/api/executions').then((r) => r.body)).toHaveLength(6); // no duplicate records
  });

  it('9. the scheduler chooses the optimal schedule when multiple feasible schedules exist', async () => {
    // Reconfigure J1..J3 into a trap for greedy first-fit (highest priority first, earliest slot, first
    // machine): greedy puts J1 on M1 at slot 0, which makes J2 (M1 only, must run in [0, 4)) impossible.
    const trap = (id: string, overrides: Record<string, unknown>) =>
      request(app).put(`/api/jobs/${id}`).send(jobBody(id, { dependencies: [], ...overrides })).expect(200);
    await trap('J1', { priority: 10, duration: 2, eligibleMachines: ['M1', 'M2'] });
    await trap('J2', { priority: 9, duration: 4, deadline: 4, eligibleMachines: ['M1'] });
    await trap('J3', { priority: 8, duration: 2, eligibleMachines: ['M1', 'M2'] });
    for (const id of ['J4', 'J5', 'J6']) await trap(id, { deadline: 0 }); // cannot be scheduled: keep them out

    const schedule = await generate();

    expect(schedule.totalPriority).toBe(27); // all three; greedy would only reach 18
    expect(schedule.scheduledCount).toBe(3);
    expect(at(schedule.assignments, 'J1')).toMatchObject({ machineId: 'M2', start: 0 });
    expect(at(schedule.assignments, 'J2')).toMatchObject({ machineId: 'M1', start: 0 });
    expect(schedule.exclusions.map((e: { jobId: string }) => e.jobId)).toEqual(['J4', 'J5', 'J6']);
  });

  it('9b. on the sample data many schedules score 45, and the minimum-makespan, lexicographically smallest one wins', async () => {
    const schedule = await generate();
    expect(schedule).toMatchObject({ totalPriority: 45, scheduledCount: 6, makespan: 7 });
    expect(schedule.assignments.map((a: Assignment) => `${a.jobId}:${a.machineId}@${a.start}`)).toEqual([
      'J1:M2@0', 'J2:M1@0', 'J3:M2@2', 'J4:M2@4', 'J5:M1@4', 'J6:M1@2',
    ]);
  });

  it('10. invalid job input returns a meaningful error', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send(jobBody('J7', { priority: 11, duration: 0, operationType: 'SEND_EMAIL', eligibleMachines: [] }))
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const issues = res.body.error.details.issues as Array<{ field: string; message: string }>;
    expect(issues.map((i) => i.field).sort()).toEqual(['duration', 'eligibleMachines', 'operationType', 'priority']);
    expect(issues.find((i) => i.field === 'priority')!.message).toBe('must be an integer between 1 and 10');
    expect(issues.find((i) => i.field === 'duration')!.message).toContain('at least 1');
    expect(issues.find((i) => i.field === 'operationType')!.message).toContain('BUILD_EDITORIAL_REPORT');
  });
});
