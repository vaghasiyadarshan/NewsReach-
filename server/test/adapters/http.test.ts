import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_JOBS } from '../../src/application/sample-data.ts';
import { createUseCases, type UseCases } from '../../src/composition.ts';
import { createApp } from '../../src/adapters/http/app.ts';
import { toErrorResponse } from '../../src/adapters/http/error-mapper.ts';
import { createTestPool, truncateAll } from '../db.ts';
import { TickingClock } from '../support/in-memory.ts';

const pool = createTestPool();
const app = createApp(createUseCases(pool, new TickingClock()));

beforeEach(() => truncateAll(pool));
afterAll(() => pool.end());

const reset = () => request(app).post('/api/dev/reset-sample').expect(200);

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

describe('POST /api/jobs', () => {
  it('creates a job and returns 201 with the job', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').send(jobBody('J7')).expect(201);
    expect(res.body).toMatchObject({ id: 'J7', status: 'PENDING', eligibleMachines: ['M1'], dependencies: [] });
  });

  // Mandatory test 10: invalid job input returns a meaningful error
  it('returns 400 listing every invalid field', async () => {
    await reset();
    const res = await request(app)
      .post('/api/jobs')
      .send(jobBody('J7', { priority: 11, duration: 0, operationType: 'SEND_EMAIL', eligibleMachines: [] }))
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const issues = res.body.error.details.issues as Array<{ field: string; message: string }>;
    expect(issues.map((i) => i.field).sort()).toEqual(['duration', 'eligibleMachines', 'operationType', 'priority']);
    expect(issues.find((i) => i.field === 'priority')!.message).toBe('must be an integer between 1 and 10');
    expect(issues.find((i) => i.field === 'operationType')!.message).toContain('VALIDATE_ARTICLE');
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await request(app).post('/api/jobs').set('Content-Type', 'application/json').send('{ not json').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 400 for an empty body', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 for a duplicate id', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').send(jobBody('J1')).expect(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: 'Job J1 already exists' });
  });

  // Mandatory test 6: a missing dependency reference is rejected
  it('returns 422 naming the missing dependency and stores nothing', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').send(jobBody('J7', { dependencies: ['J9'] })).expect(422);
    expect(res.body.error.code).toBe('MISSING_REFERENCE');
    expect(res.body.error.details).toEqual({ kind: 'dependency', ids: ['J9'] });
    await request(app).get('/api/jobs/J7').expect(404);
  });

  it('returns 422 naming an unknown machine', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').send(jobBody('J7', { eligibleMachines: ['M9'] })).expect(422);
    expect(res.body.error.details).toEqual({ kind: 'machine', ids: ['M9'] });
  });

  it('returns 422 for a self dependency', async () => {
    await reset();
    const res = await request(app).post('/api/jobs').send(jobBody('J7', { dependencies: ['J7'] })).expect(422);
    expect(res.body.error).toMatchObject({ code: 'CIRCULAR_DEPENDENCY', details: { cycle: ['J7', 'J7'] } });
  });
});

describe('GET /api/jobs', () => {
  it('lists all jobs with their status', async () => {
    await reset();
    const res = await request(app).get('/api/jobs').expect(200);
    expect(res.body.map((j: { id: string }) => j.id)).toEqual(['J1', 'J2', 'J3', 'J4', 'J5', 'J6']);
    expect(res.body[0]).toMatchObject({ operationType: 'VALIDATE_ARTICLE', status: 'PENDING' });
  });

  it('returns one job with full details', async () => {
    await reset();
    const res = await request(app).get('/api/jobs/J3').expect(200);
    expect(res.body).toMatchObject({ id: 'J3', dependencies: ['J1'], eligibleMachines: ['M1', 'M2'], inputData: { summary_words: 20 } });
  });

  it('returns 404 for an unknown job', async () => {
    await reset();
    const res = await request(app).get('/api/jobs/J99').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Job J99 not found' });
  });
});

describe('PUT /api/jobs/:id', () => {
  it('updates a job', async () => {
    await reset();
    const res = await request(app).put('/api/jobs/J6').send(jobBody('J6', { priority: 9, name: 'Renamed' })).expect(200);
    expect(res.body).toMatchObject({ id: 'J6', priority: 9, name: 'Renamed' });
    expect((await request(app).get('/api/jobs/J6')).body.priority).toBe(9);
  });

  it('returns 404 for an unknown job', async () => {
    await reset();
    await request(app).put('/api/jobs/J99').send(jobBody('J99')).expect(404);
  });

  it('returns 400 when the body id contradicts the path', async () => {
    await reset();
    const res = await request(app).put('/api/jobs/J6').send(jobBody('J5')).expect(400);
    expect(res.body.error.details.issues[0].field).toBe('id');
  });

  // Mandatory test 5: a circular dependency is rejected
  it('returns 422 with the cycle path when an update would create a cycle, leaving the job unchanged', async () => {
    await reset();
    const j1 = SAMPLE_JOBS[0]!; // J3 already depends on J1
    const res = await request(app).put('/api/jobs/J1').send({ ...j1, dependencies: ['J3'] }).expect(422);

    expect(res.body.error.code).toBe('CIRCULAR_DEPENDENCY');
    expect(res.body.error.details.cycle).toEqual(['J1', 'J3', 'J1']);
    expect(res.body.error.message).toContain('J1 -> J3 -> J1');
    expect((await request(app).get('/api/jobs/J1')).body.dependencies).toEqual([]);
  });
});

describe('schedules', () => {
  it('returns 404 for the latest schedule before any was generated', async () => {
    await reset();
    const res = await request(app).get('/api/schedules/latest').expect(404);
    expect(res.body.error.message).toBe('No schedule has been generated yet');
  });

  it('generates the optimal schedule for the sample data', async () => {
    await reset();
    const res = await request(app).post('/api/schedules/generate').expect(201);
    expect(res.body).toMatchObject({ totalPriority: 45, scheduledCount: 6, makespan: 7, status: 'GENERATED', stale: false });
    expect(res.body.assignments).toHaveLength(6);
    expect(res.body).not.toHaveProperty('snapshot');

    const latest = await request(app).get('/api/schedules/latest').expect(200);
    expect(latest.body.id).toBe(res.body.id);
  });

  it('returns excluded jobs with reasons', async () => {
    await reset();
    await request(app).post('/api/jobs').send(jobBody('J7', { releaseTime: 6, duration: 4, deadline: 8 })).expect(201);
    const res = await request(app).post('/api/schedules/generate').expect(201);
    expect(res.body.exclusions).toHaveLength(1);
    expect(res.body.exclusions[0]).toMatchObject({ jobId: 'J7', code: 'WINDOW_TOO_SMALL' });
  });

  it('returns 422 when more than 8 jobs are stored', async () => {
    await reset();
    for (const id of ['J7', 'J8', 'J9']) await request(app).post('/api/jobs').send(jobBody(id)).expect(201);
    const res = await request(app).post('/api/schedules/generate').expect(422);
    expect(res.body.error).toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(res.body.error.message).toContain('at most 8');
  });

  it('reports stale after a job edit', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    await request(app).put('/api/jobs/J6').send(jobBody('J6', { priority: 9 })).expect(200);
    expect((await request(app).get('/api/schedules/latest')).body.stale).toBe(true);
  });
});

describe('running schedules', () => {
  it('returns 404 when there is nothing to run', async () => {
    await reset();
    await request(app).post('/api/schedules/run').expect(404);
  });

  it('runs the schedule, executes the operations and records the results', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    const res = await request(app).post('/api/schedules/run').expect(200);

    expect(res.body).toMatchObject({ completed: ['J1', 'J2', 'J3', 'J6', 'J4', 'J5'], failed: [], blocked: [], skipped: [] });
    expect(res.body.schedule.status).toBe('COMPLETED');
    const j2 = res.body.schedule.executions.find((e: { jobId: string }) => e.jobId === 'J2');
    expect(j2.output.wordCount).toBeGreaterThan(40);
  });

  // Mandatory test 8 over HTTP
  it('does nothing when the run is repeated', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    const first = await request(app).post('/api/schedules/run').expect(200);
    const second = await request(app).post('/api/schedules/run').expect(200);

    expect(second.body.completed).toEqual([]);
    expect(second.body.skipped).toHaveLength(6);
    expect(second.body.schedule.executions).toEqual(first.body.schedule.executions);
  });

  // Mandatory test 7 over HTTP
  it('blocks the dependent of a failed job', async () => {
    await reset();
    await request(app).put('/api/jobs/J1').send({ ...SAMPLE_JOBS[0], inputData: { title: '', body: 'x' } }).expect(200);
    await request(app).post('/api/schedules/generate').expect(201);
    const res = await request(app).post('/api/schedules/run').expect(200);

    expect(res.body).toMatchObject({ failed: ['J1'], blocked: ['J3'] });
    const byJob = Object.fromEntries(res.body.schedule.executions.map((e: { jobId: string }) => [e.jobId, e]));
    expect(byJob.J1).toMatchObject({ status: 'FAILED', error: 'Missing or empty field: title' });
    expect(byJob.J3).toMatchObject({ status: 'BLOCKED', startedAt: null });
  });

  it('returns 409 for a stale schedule', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    await request(app).put('/api/jobs/J6').send(jobBody('J6', { priority: 9 })).expect(200);
    const res = await request(app).post('/api/schedules/run').expect(409);
    expect(res.body.error.message).toContain('stale');
  });

  it('runs a specific schedule when scheduleId is given, and validates it', async () => {
    await reset();
    const generated = await request(app).post('/api/schedules/generate').expect(201);
    await request(app).post('/api/schedules/run').send({ scheduleId: generated.body.id }).expect(200);
    await request(app).post('/api/schedules/run').send({ scheduleId: 999 }).expect(404);
    const bad = await request(app).post('/api/schedules/run').send({ scheduleId: 'x' }).expect(400);
    expect(bad.body.error.details.issues[0].field).toBe('body.scheduleId');
  });
});

describe('executions', () => {
  it('lists execution history and returns one execution with logs', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    await request(app).post('/api/schedules/run').expect(200);

    const list = await request(app).get('/api/executions').expect(200);
    expect(list.body).toHaveLength(6);
    expect(list.body[0]).toMatchObject({ jobName: expect.any(String), machineId: expect.any(String), status: 'COMPLETED' });

    const detail = await request(app).get(`/api/executions/${list.body[0].id}`).expect(200);
    expect(detail.body.logs.length).toBe(2);
    expect(detail.body.logs[0].message).toContain('Started');
  });

  it('filters by schedule', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    expect((await request(app).get('/api/executions?scheduleId=1')).body).toHaveLength(6);
    expect((await request(app).get('/api/executions?scheduleId=2')).body).toHaveLength(0);
  });

  it('returns 404 for an unknown execution and 400 for a malformed id', async () => {
    await reset();
    await request(app).get('/api/executions/9999').expect(404);
    const bad = await request(app).get('/api/executions/abc').expect(400);
    expect(bad.body.error.details.issues[0].field).toBe('params.id');
  });
});

describe('machines, dashboard and system', () => {
  it('lists machines', async () => {
    await reset();
    const res = await request(app).get('/api/machines').expect(200);
    expect(res.body).toEqual([
      { id: 'M1', name: 'Processing Machine 1', status: 'AVAILABLE' },
      { id: 'M2', name: 'Processing Machine 2', status: 'AVAILABLE' },
    ]);
  });

  it('serves the dashboard aggregate', async () => {
    await reset();
    await request(app).post('/api/schedules/generate').expect(201);
    await request(app).post('/api/schedules/run').expect(200);
    const res = await request(app).get('/api/dashboard').expect(200);
    expect(res.body.overview).toEqual({ total: 6, scheduled: 0, running: 0, completed: 6, failed: 0, blocked: 0, unscheduled: 0 });
    expect(res.body.schedule).toMatchObject({ totalPriority: 45, makespan: 7, status: 'COMPLETED' });
    expect(res.body.machines[0]).toMatchObject({ id: 'M1', busySlots: 5, workloadPercent: 42 });
  });

  it('has a health route', async () => {
    expect((await request(app).get('/api/health').expect(200)).body).toEqual({ status: 'ok' });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('can disable the destructive reset route', async () => {
    const guarded = createApp(createUseCases(pool), { enableDevRoutes: false });
    await request(guarded).post('/api/dev/reset-sample').expect(404);
  });
});

describe('error mapping', () => {
  it('turns an unexpected failure into a generic 500 without leaking details', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = createApp({
      listJobs: { execute: () => Promise.reject(new Error('secret connection string')) },
    } as unknown as UseCases);

    const res = await request(broken).get('/api/jobs').expect(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    spy.mockRestore();
  });

  it('maps unknown errors to 500', () => {
    expect(toErrorResponse(new Error('x')).status).toBe(500);
    expect(toErrorResponse('weird').status).toBe(500);
  });
});
