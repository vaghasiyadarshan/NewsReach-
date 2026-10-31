import { beforeEach, describe, expect, it } from 'vitest';
import { CreateJob } from '../../src/application/use-cases/create-job.ts';
import { GetJob } from '../../src/application/use-cases/get-job.ts';
import { ListJobs } from '../../src/application/use-cases/list-jobs.ts';
import { UpdateJob } from '../../src/application/use-cases/update-job.ts';
import {
  ConflictError,
  GraphError,
  MissingReferenceError,
  NotFoundError,
  ValidationError,
} from '../../src/domain/model/errors.ts';
import { InMemoryStore } from '../support/in-memory.ts';

const validJob = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Job ${id}`,
  operationType: 'COUNT_WORDS',
  duration: 2,
  releaseTime: 0,
  deadline: 8,
  priority: 5,
  eligibleMachines: ['M1', 'M2'],
  dependencies: [],
  inputData: { body: 'one two three' },
  ...overrides,
});

let store: InMemoryStore;
let create: CreateJob;
let update: UpdateJob;

beforeEach(async () => {
  store = new InMemoryStore();
  await store.repos.machines.insertMany([
    { id: 'M1', name: 'Processing Machine 1', status: 'AVAILABLE' },
    { id: 'M2', name: 'Processing Machine 2', status: 'AVAILABLE' },
  ]);
  create = new CreateJob(store.uow);
  update = new UpdateJob(store.uow);
});

const issuesOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).issues;
};

describe('CreateJob', () => {
  it('stores a valid job and returns it as PENDING', async () => {
    const created = await create.execute(validJob('J1'));
    expect(created).toMatchObject({ id: 'J1', status: 'PENDING', priority: 5, eligibleMachines: ['M1', 'M2'] });
    expect(await store.repos.jobs.findById('J1')).not.toBeNull();
  });

  it('rejects a duplicate job id', async () => {
    await create.execute(validJob('J1'));
    await expect(create.execute(validJob('J1'))).rejects.toBeInstanceOf(ConflictError);
    await expect(create.execute(validJob('J1'))).rejects.toThrow('J1');
  });

  it('rejects a priority outside 1 to 10 and states the range', async () => {
    for (const priority of [0, 11]) {
      const issues = await issuesOf(create.execute(validJob('J1', { priority })));
      expect(issues).toEqual([{ field: 'priority', message: 'must be an integer between 1 and 10' }]);
    }
  });

  it('rejects a non-positive duration and a negative release time', async () => {
    const issues = await issuesOf(create.execute(validJob('J1', { duration: 0, releaseTime: -1 })));
    expect(issues.map((i) => i.field).sort()).toEqual(['duration', 'releaseTime']);
  });

  it('rejects non-integer numbers and numbers sent as text', async () => {
    const issues = await issuesOf(create.execute(validJob('J1', { duration: 1.5, deadline: '8' })));
    expect(issues.map((i) => i.field).sort()).toEqual(['deadline', 'duration']);
  });

  it('rejects an unknown operation type and lists the supported ones', async () => {
    const issues = await issuesOf(create.execute(validJob('J1', { operationType: 'SEND_EMAIL' })));
    expect(issues[0]!.field).toBe('operationType');
    expect(issues[0]!.message).toContain('VALIDATE_ARTICLE');
    expect(issues[0]!.message).toContain('BUILD_EDITORIAL_REPORT');
  });

  it('rejects empty eligible machines', async () => {
    const issues = await issuesOf(create.execute(validJob('J1', { eligibleMachines: [] })));
    expect(issues.map((i) => i.field)).toEqual(['eligibleMachines']);
  });

  it('reports every invalid field in one error', async () => {
    const issues = await issuesOf(
      create.execute({ priority: 99, duration: 0, operationType: 'NOPE', eligibleMachines: 'M1', inputData: [] }),
    );
    expect(issues.map((i) => i.field).sort()).toEqual([
      'deadline',
      'duration',
      'eligibleMachines',
      'id',
      'inputData',
      'name',
      'operationType',
      'priority',
      'releaseTime',
    ]);
  });

  it('rejects a body that is not an object', async () => {
    const issues = await issuesOf(create.execute('hello'));
    expect(issues).toEqual([{ field: 'body', message: 'must be a JSON object' }]);
  });

  it('rejects ids that are not URL safe', async () => {
    const issues = await issuesOf(create.execute(validJob('has space')));
    expect(issues[0]!.field).toBe('id');
  });

  it('accepts a job whose deadline leaves too little time (the scheduler excludes it later)', async () => {
    const created = await create.execute(validJob('J1', { releaseTime: 5, duration: 4, deadline: 6 }));
    expect(created.status).toBe('PENDING');
  });

  it('defaults dependencies and inputData and normalizes machine lists', async () => {
    const created = await create.execute({ ...validJob('J1'), dependencies: undefined, inputData: undefined, eligibleMachines: ['M2', 'M1', 'M2'] });
    expect(created.dependencies).toEqual([]);
    expect(created.inputData).toEqual({});
    expect(created.eligibleMachines).toEqual(['M1', 'M2']);
  });

  // Mandatory test 10: invalid job input returns a meaningful error (covered above field by field)

  it('rejects an unknown machine and names it', async () => {
    const error = await create.execute(validJob('J1', { eligibleMachines: ['M1', 'M9'] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingReferenceError);
    expect(error).toMatchObject({ kind: 'machine', ids: ['M9'] });
  });

  // Mandatory test 6: a missing dependency reference is rejected
  it('rejects a missing dependency, names it and stores nothing', async () => {
    const error = await create.execute(validJob('J3', { dependencies: ['J9', 'J8'] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingReferenceError);
    expect(error).toMatchObject({ kind: 'dependency', ids: ['J8', 'J9'] });
    expect(await store.repos.jobs.findById('J3')).toBeNull();
  });

  it('accepts a dependency on an existing job', async () => {
    await create.execute(validJob('J1'));
    const created = await create.execute(validJob('J2', { dependencies: ['J1'] }));
    expect(created.dependencies).toEqual(['J1']);
  });

  // Mandatory test 5: a circular dependency is rejected
  it('rejects a self dependency as a cycle', async () => {
    const error = await create.execute(validJob('J1', { dependencies: ['J1'] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect((error as GraphError).cycle).toEqual(['J1', 'J1']);
    expect(await store.repos.jobs.findById('J1')).toBeNull();
  });
});

describe('UpdateJob', () => {
  it('persists new values and returns the updated job', async () => {
    await create.execute(validJob('J1'));
    const updated = await update.execute('J1', validJob('J1', { priority: 9, name: 'Renamed' }));
    expect(updated).toMatchObject({ id: 'J1', priority: 9, name: 'Renamed' });
    expect((await store.repos.jobs.findById('J1'))!.priority).toBe(9);
  });

  it('accepts a body without an id', async () => {
    await create.execute(validJob('J1'));
    const { id: _omitted, ...body } = validJob('J1', { priority: 7 });
    expect((await update.execute('J1', body)).priority).toBe(7);
  });

  it('returns not found for an unknown job', async () => {
    await expect(update.execute('J9', validJob('J9'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a body id that differs from the path id', async () => {
    await create.execute(validJob('J1'));
    const issues = await issuesOf(update.execute('J1', validJob('J2')));
    expect(issues).toEqual([{ field: 'id', message: 'must match the id in the path (J1)' }]);
  });

  it('applies the same validation as creation', async () => {
    await create.execute(validJob('J1'));
    const issues = await issuesOf(update.execute('J1', validJob('J1', { priority: 11 })));
    expect(issues[0]!.field).toBe('priority');
  });

  // Mandatory test 5 (cycle by update): J2 depends on J1, then J1 is changed to depend on J2
  it('rejects a cycle created by an update, reports the path and leaves the job unchanged', async () => {
    await create.execute(validJob('J1'));
    await create.execute(validJob('J2', { dependencies: ['J1'] }));

    const error = await update.execute('J1', validJob('J1', { dependencies: ['J2'] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect((error as GraphError).cycle).toEqual(['J1', 'J2', 'J1']);
    expect((error as GraphError).message).toContain('J1 -> J2 -> J1');
    expect((await store.repos.jobs.findById('J1'))!.dependencies).toEqual([]);
  });

  it('rejects a self dependency on update', async () => {
    await create.execute(validJob('J1'));
    await expect(update.execute('J1', validJob('J1', { dependencies: ['J1'] }))).rejects.toBeInstanceOf(GraphError);
  });

  it('rejects a missing dependency on update', async () => {
    await create.execute(validJob('J1'));
    await expect(update.execute('J1', validJob('J1', { dependencies: ['J7'] }))).rejects.toBeInstanceOf(
      MissingReferenceError,
    );
  });
});

describe('GetJob and ListJobs', () => {
  it('lists jobs sorted by id with their status', async () => {
    await create.execute(validJob('J2'));
    await create.execute(validJob('J1'));
    const jobs = await new ListJobs(store.uow).execute();
    expect(jobs.map((j) => [j.id, j.status])).toEqual([
      ['J1', 'PENDING'],
      ['J2', 'PENDING'],
    ]);
  });

  it('returns full job details', async () => {
    await create.execute(validJob('J1', { inputData: { body: 'x y' } }));
    const job = await new GetJob(store.uow).execute('J1');
    expect(job).toMatchObject({ id: 'J1', operationType: 'COUNT_WORDS', inputData: { body: 'x y' } });
  });

  it('returns not found for an unknown job', async () => {
    await expect(new GetJob(store.uow).execute('J9')).rejects.toBeInstanceOf(NotFoundError);
  });
});
