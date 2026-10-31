import { describe, expect, it } from 'vitest';
import { analyzeFeasibility } from '../../src/domain/scheduling/feasibility.ts';
import { HORIZON } from '../../src/domain/scheduling/limits.ts';
import { job, M1, M2, machine, sampleJobs } from './fixtures.ts';

const analyze = (jobs: ReturnType<typeof job>[], machines = [M1, M2]) =>
  analyzeFeasibility(jobs, machines, HORIZON);

describe('feasibility pre-checks', () => {
  it('keeps every sample job as a candidate', () => {
    const { candidates, exclusions } = analyze(sampleJobs());
    expect(candidates.map((c) => c.job.id)).toEqual(['J1', 'J2', 'J3', 'J4', 'J5', 'J6']);
    expect(exclusions).toEqual([]);
  });

  // Mandatory test 4: a job that cannot meet its deadline is excluded
  it('excludes a job whose deadline cannot be met, with a reason', () => {
    const { candidates, exclusions } = analyze([job('J1', { releaseTime: 3, duration: 3, deadline: 5 })]);
    expect(candidates).toHaveLength(0);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ jobId: 'J1', code: 'WINDOW_TOO_SMALL' });
    expect(exclusions[0]!.reason).toContain('slot 6');
    expect(exclusions[0]!.reason).toContain('slot 5');
  });

  it('treats a deadline beyond the horizon as the horizon', () => {
    const { exclusions } = analyze([job('J1', { releaseTime: 10, duration: 3, deadline: 20 })]);
    expect(exclusions[0]).toMatchObject({ code: 'WINDOW_TOO_SMALL' });
    expect(exclusions[0]!.reason).toContain('planning horizon');
  });

  it('accepts a job that finishes exactly on its deadline (half-open interval)', () => {
    const { candidates } = analyze([job('J1', { releaseTime: 3, duration: 2, deadline: 5 })]);
    expect(candidates).toHaveLength(1);
  });

  it('excludes a job with no available eligible machine', () => {
    const { exclusions } = analyze(
      [job('J1', { eligibleMachines: ['M2', 'M9'] })],
      [M1, machine('M2', 'UNAVAILABLE')],
    );
    expect(exclusions[0]).toMatchObject({ jobId: 'J1', code: 'NO_AVAILABLE_MACHINE' });
    expect(exclusions[0]!.reason).toContain('M2, M9');
  });

  it('only offers available eligible machines as usable', () => {
    const { candidates } = analyze(
      [job('J1', { eligibleMachines: ['M2', 'M1'] })],
      [M1, machine('M2', 'UNAVAILABLE')],
    );
    expect(candidates[0]!.usableMachines).toEqual(['M1']);
  });

  it('excludes a job whose dependency is excluded, naming the dependency', () => {
    const { candidates, exclusions } = analyze([
      job('J1', { releaseTime: 4, duration: 3, deadline: 5 }),
      job('J2', { dependencies: ['J1'] }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(exclusions.map((e) => [e.jobId, e.code])).toEqual([
      ['J1', 'WINDOW_TOO_SMALL'],
      ['J2', 'DEPENDENCY_EXCLUDED'],
    ]);
    expect(exclusions[1]!.reason).toContain('J1');
  });

  it('propagates exclusion transitively', () => {
    const { exclusions } = analyze([
      job('J1', { eligibleMachines: ['M9'] }),
      job('J2', { dependencies: ['J1'] }),
      job('J3', { dependencies: ['J2'] }),
    ]);
    expect(exclusions.map((e) => e.jobId)).toEqual(['J1', 'J2', 'J3']);
    expect(exclusions[2]!.reason).toContain('J2');
  });

  it('excludes a job whose dependency chain pushes it past its deadline', () => {
    const { candidates, exclusions } = analyze([
      job('J1', { duration: 2 }),
      job('J2', { duration: 2, deadline: 3, dependencies: ['J1'] }),
    ]);
    expect(candidates.map((c) => c.job.id)).toEqual(['J1']);
    expect(exclusions[0]).toMatchObject({ jobId: 'J2', code: 'WINDOW_TOO_SMALL' });
    expect(exclusions[0]!.reason).toContain('dependencies');
  });

  it('computes earliest start through dependency chains', () => {
    const { candidates } = analyze([
      job('J1', { duration: 2, releaseTime: 1 }),
      job('J2', { duration: 2, dependencies: ['J1'] }),
      job('J3', { duration: 1, releaseTime: 0, dependencies: ['J2'] }),
    ]);
    expect(candidates.map((c) => [c.job.id, c.earliestStart])).toEqual([
      ['J1', 1],
      ['J2', 3],
      ['J3', 5],
    ]);
  });
});
