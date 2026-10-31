import { describe, expect, it } from 'vitest';
import { LimitExceededError } from '../../../../../src/application/errors/errors.ts';
import { findOptimalSchedule } from '../../../../../src/application/helper/scheduling/solver.ts';
import { job, M1, M2, machine } from '../../../../fixtures/fixtures.ts';
import { expectValidSchedule } from '../../../../fixtures/validity.ts';

const assignmentOf = (result: ReturnType<typeof findOptimalSchedule>, jobId: string) =>
  result.assignments.find((a) => a.jobId === jobId)!;

describe('solver: machines and parallelism', () => {
  // Mandatory test 1: two independent jobs execute simultaneously on different machines
  it('runs two independent jobs at the same time on different machines', () => {
    const jobs = [job('J1', { duration: 2 }), job('J2', { duration: 2 })];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    const [a, b] = [assignmentOf(result, 'J1'), assignmentOf(result, 'J2')];
    expect(a.start).toBe(0);
    expect(b.start).toBe(0);
    expect(a.machineId).not.toBe(b.machineId);
    expect(result.makespan).toBe(2);
    expectValidSchedule(jobs, [M1, M2], result);
  });

  // Mandatory test 2: two jobs on the same machine never overlap
  it('never overlaps jobs that can only use the same machine', () => {
    const jobs = [
      job('J1', { duration: 2, eligibleMachines: ['M1'] }),
      job('J2', { duration: 2, eligibleMachines: ['M1'] }),
      job('J3', { duration: 2, eligibleMachines: ['M1'] }),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => [a.jobId, a.start, a.machineId])).toEqual([
      ['J1', 0, 'M1'],
      ['J2', 2, 'M1'],
      ['J3', 4, 'M1'],
    ]);
    expectValidSchedule(jobs, [M1, M2], result);
  });

  it('allows a job to start exactly when another ends on the same machine (half-open)', () => {
    const jobs = [
      job('J1', { duration: 2, deadline: 2, eligibleMachines: ['M1'] }),
      job('J2', { duration: 2, releaseTime: 2, eligibleMachines: ['M1'] }),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.scheduledCount).toBe(2);
    expect(assignmentOf(result, 'J2').start).toBe(2);
  });

  it('never uses an unavailable machine', () => {
    const jobs = [job('J1', { eligibleMachines: ['M2'] }), job('J2', { eligibleMachines: ['M1', 'M2'] })];
    const machines = [M1, machine('M2', 'UNAVAILABLE')];
    const result = findOptimalSchedule({ jobs, machines });
    expect(result.exclusions.map((e) => [e.jobId, e.code])).toEqual([['J1', 'NO_AVAILABLE_MACHINE']]);
    expect(assignmentOf(result, 'J2').machineId).toBe('M1');
    expectValidSchedule(jobs, machines, result);
  });
});

describe('solver: dependencies', () => {
  // Mandatory test 3: a dependent job starts only after its dependency completes
  it('starts a dependent job only after its dependency finishes, even on another machine', () => {
    const jobs = [job('J1', { duration: 3 }), job('J2', { duration: 1, dependencies: ['J1'] })];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(assignmentOf(result, 'J2').start).toBeGreaterThanOrEqual(assignmentOf(result, 'J1').end);
    expect(result.makespan).toBe(4);
    expectValidSchedule(jobs, [M1, M2], result);
  });

  it('handles a dependency with a higher ID than its dependent', () => {
    const jobs = [job('J1', { duration: 2, dependencies: ['J2'] }), job('J2', { duration: 2 })];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(assignmentOf(result, 'J2').start).toBe(0);
    expect(assignmentOf(result, 'J1').start).toBe(2);
    expectValidSchedule(jobs, [M1, M2], result);
  });

  it('respects release times of dependents after their dependencies', () => {
    const jobs = [
      job('J1', { duration: 1 }),
      job('J2', { duration: 1, releaseTime: 5, dependencies: ['J1'] }),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(assignmentOf(result, 'J2').start).toBe(5);
    expect(result.makespan).toBe(6);
  });

  it('never schedules a job without its dependencies', () => {
    const jobs = [
      job('J1', { releaseTime: 4, duration: 3, deadline: 5 }),
      job('J2', { priority: 10, dependencies: ['J1'] }),
      job('J3', { priority: 1 }),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J3']);
    expect(result.exclusions.map((e) => [e.jobId, e.code])).toEqual([
      ['J1', 'WINDOW_TOO_SMALL'],
      ['J2', 'DEPENDENCY_EXCLUDED'],
    ]);
  });
});

describe('solver: optimization order', () => {
  // M1 only, everything must fit in [0, 4): two jobs of one machine cannot coexist with the big one.
  const m1Only = (id: string, priority: number, duration: number, extra = {}) =>
    job(id, { priority, duration, deadline: 4, eligibleMachines: ['M1'], ...extra });

  it('maximizes total priority before job count', () => {
    const jobs = [m1Only('J1', 10, 4), m1Only('J2', 4, 2), m1Only('J3', 4, 2)];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J1']);
    expect(result.totalPriority).toBe(10);
  });

  it('maximizes job count when total priority ties', () => {
    const jobs = [m1Only('J1', 6, 4), m1Only('J2', 3, 2), m1Only('J3', 3, 2)];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J2', 'J3']);
    expect(result.totalPriority).toBe(6);
    expect(result.scheduledCount).toBe(2);
  });

  it('minimizes makespan when priority and count tie, even against a smaller job ID', () => {
    const window = { deadline: 5, eligibleMachines: ['M1'], priority: 5 };
    const jobs = [job('J1', { ...window, duration: 5 }), job('J2', { ...window, duration: 3 })];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => [a.jobId, a.start])).toEqual([['J2', 0]]);
    expect(result.makespan).toBe(3);
  });

  it('breaks remaining ties with the smallest (jobId, start, machine) sequence', () => {
    const jobs = [job('J1', { duration: 2 }), job('J2', { duration: 2 })];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => [a.jobId, a.start, a.machineId])).toEqual([
      ['J1', 0, 'M1'],
      ['J2', 0, 'M2'],
    ]);
  });

  it('prefers the lexicographically smaller job set when scores and makespans tie', () => {
    // Either J1 or J2 fits next to J3 on the single machine; the smaller ID must win.
    const jobs = [
      m1Only('J1', 5, 2),
      m1Only('J2', 5, 2),
      m1Only('J3', 5, 2),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J1', 'J2']);
  });

  it('is deterministic across repeated runs', () => {
    const jobs = [job('J1', { duration: 2 }), job('J2', { duration: 3 }), job('J3', { duration: 1 })];
    const first = findOptimalSchedule({ jobs, machines: [M1, M2] });
    const second = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(second.assignments).toEqual(first.assignments);
  });
});

describe('solver: exclusion reasons for displaced jobs', () => {
  const m1Only = (id: string, priority: number, duration: number) =>
    job(id, { priority, duration, deadline: 4, eligibleMachines: ['M1'] });

  it('says including a displaced job would lower the total priority', () => {
    const result = findOptimalSchedule({ jobs: [m1Only('J1', 10, 4), m1Only('J2', 4, 2), m1Only('J3', 4, 2)], machines: [M1, M2] });
    const j2 = result.exclusions.find((e) => e.jobId === 'J2')!;
    expect(j2.code).toBe('DISPLACED');
    expect(j2.reason).toBe('Including it would lower the total priority from 10 to 8.');
  });

  it('says including a displaced job would lower the job count when priority ties', () => {
    const result = findOptimalSchedule({ jobs: [m1Only('J1', 6, 4), m1Only('J2', 3, 2), m1Only('J3', 3, 2)], machines: [M1, M2] });
    const j1 = result.exclusions.find((e) => e.jobId === 'J1')!;
    expect(j1.code).toBe('DISPLACED');
    expect(j1.reason).toContain('keep the total priority at 6');
    expect(j1.reason).toContain('from 2 to 1');
  });

  it('explains a displaced job that only loses on the tie-break', () => {
    const result = findOptimalSchedule({ jobs: [m1Only('J1', 5, 2), m1Only('J2', 5, 2), m1Only('J3', 5, 2)], machines: [M1, M2] });
    const j3 = result.exclusions.find((e) => e.jobId === 'J3')!;
    expect(j3.reason).toContain('ties on total priority (10) and job count (2)');
  });

  it('flags a job that cannot be scheduled together with its dependencies', () => {
    // J2 needs J1 first, both only on M1, but together they need 4 slots and the window is 3.
    const jobs = [
      job('J1', { duration: 2, deadline: 3, eligibleMachines: ['M1'] }),
      job('J2', { duration: 2, deadline: 3, eligibleMachines: ['M1'], dependencies: ['J1'] }),
    ];
    // each job fits its window alone, and J2's chain finish (4) exceeds the deadline (3)
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J1']);
    expect(result.exclusions[0]).toMatchObject({ jobId: 'J2', code: 'WINDOW_TOO_SMALL' });
  });

  it('flags a job whose closure is infeasible only because of machine conflicts', () => {
    // Window checks pass for J3 (earliest finish 4 <= 4), but J1 and J2 both need M1 in [0, 2).
    const jobs = [
      job('J1', { duration: 2, deadline: 2, eligibleMachines: ['M1'] }),
      job('J2', { duration: 2, deadline: 2, eligibleMachines: ['M1'], priority: 9 }),
      job('J3', { duration: 2, deadline: 4, eligibleMachines: ['M2'], dependencies: ['J1', 'J2'], priority: 9 }),
    ];
    const result = findOptimalSchedule({ jobs, machines: [M1, M2] });
    expect(result.assignments.map((a) => a.jobId)).toEqual(['J2']);
    expect(result.exclusions.find((e) => e.jobId === 'J3')).toMatchObject({ code: 'WINDOW_TOO_SMALL' });
    expect(result.exclusions.find((e) => e.jobId === 'J3')!.reason).toContain('together with its dependencies');
  });
});

describe('solver: guards', () => {
  it('rejects more than 8 jobs', () => {
    const jobs = Array.from({ length: 9 }, (_, i) => job(`J${i + 1}`));
    expect(() => findOptimalSchedule({ jobs, machines: [M1, M2] })).toThrow(LimitExceededError);
  });

  it('rejects more than 3 machines', () => {
    const machines = [M1, M2, machine('M3'), machine('M4')];
    expect(() => findOptimalSchedule({ jobs: [job('J1')], machines })).toThrow(LimitExceededError);
  });

  it('returns an empty schedule when there are no jobs', () => {
    const result = findOptimalSchedule({ jobs: [], machines: [M1, M2] });
    expect(result).toMatchObject({ assignments: [], exclusions: [], totalPriority: 0, scheduledCount: 0, makespan: 0 });
  });
});
