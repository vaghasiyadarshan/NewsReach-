import { describe, expect, it } from 'vitest';
import type { Job } from '../../src/domain/model/job.ts';
import type { Assignment } from '../../src/domain/model/schedule.ts';
import { solve } from '../../src/domain/scheduling/solver.ts';
import { job, M1, M2, sampleJobs } from './fixtures.ts';
import { expectValidSchedule } from './validity.ts';

/** The strategy the brief forbids: highest priority first, earliest start, first machine. */
function greedyFirstFit(jobs: readonly Job[], horizon = 12): { assignments: Assignment[]; totalPriority: number } {
  const placed = new Map<string, Assignment>();
  const byPriority = [...jobs].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  for (const j of byPriority) {
    if (!j.dependencies.every((d) => placed.has(d))) continue;
    const earliest = Math.max(j.releaseTime, ...j.dependencies.map((d) => placed.get(d)!.end));
    let done = false;
    for (let start = earliest; !done && start + j.duration <= Math.min(j.deadline, horizon); start++) {
      for (const machineId of [...j.eligibleMachines].sort()) {
        const end = start + j.duration;
        const clash = [...placed.values()].some((p) => p.machineId === machineId && start < p.end && p.start < end);
        if (clash) continue;
        placed.set(j.id, { jobId: j.id, machineId, start, end });
        done = true;
        break;
      }
    }
  }
  const assignments = [...placed.values()];
  return {
    assignments,
    totalPriority: assignments.reduce((sum, a) => sum + jobs.find((j) => j.id === a.jobId)!.priority, 0),
  };
}

describe('sample data (golden)', () => {
  it('schedules all six jobs with priority 45 and makespan 7, exactly as derived by hand', () => {
    const jobs = sampleJobs();
    const result = solve({ jobs, machines: [M1, M2] });

    expect(result.assignments.map((a) => [a.jobId, a.machineId, a.start, a.end])).toEqual([
      ['J1', 'M2', 0, 2],
      ['J2', 'M1', 0, 2],
      ['J3', 'M2', 2, 4],
      ['J4', 'M2', 4, 7],
      ['J5', 'M1', 4, 6],
      ['J6', 'M1', 2, 3],
    ]);
    expect(result.totalPriority).toBe(45);
    expect(result.scheduledCount).toBe(6);
    expect(result.makespan).toBe(7);
    expect(result.exclusions).toEqual([]);
    expectValidSchedule(jobs, [M1, M2], result);
  });

  it('runs well inside a second', () => {
    const { stats } = solve({ jobs: sampleJobs(), machines: [M1, M2] });
    expect(stats.elapsedMs).toBeLessThan(1000);
  });
});

describe('optimal vs greedy', () => {
  // Mandatory test 9: the scheduler chooses the optimal schedule when multiple feasible schedules exist
  it('beats greedy first-fit when the highest-priority job would block two others', () => {
    // Greedy puts J1 on M1 at slot 0, which makes J2 (M1 only, must run in [0,4)) impossible.
    const jobs = [
      job('J1', { priority: 10, duration: 2, eligibleMachines: ['M1', 'M2'] }),
      job('J2', { priority: 9, duration: 4, deadline: 4, eligibleMachines: ['M1'] }),
      job('J3', { priority: 8, duration: 2, eligibleMachines: ['M1', 'M2'] }),
    ];

    const greedy = greedyFirstFit(jobs);
    expect(greedy.assignments.some((a) => a.jobId === 'J2')).toBe(false);
    expect(greedy.totalPriority).toBe(18);

    const result = solve({ jobs, machines: [M1, M2] });
    expect(result.totalPriority).toBe(27);
    expect(result.scheduledCount).toBe(3);
    expect(result.exclusions).toEqual([]);
    expect(result.assignments.find((a) => a.jobId === 'J1')).toMatchObject({ machineId: 'M2', start: 0 });
    expect(result.assignments.find((a) => a.jobId === 'J2')).toMatchObject({ machineId: 'M1', start: 0 });
    expectValidSchedule(jobs, [M1, M2], result);
  });

  it('never does worse than greedy on the sample data', () => {
    const jobs = sampleJobs();
    const result = solve({ jobs, machines: [M1, M2] });
    expect(result.totalPriority).toBeGreaterThanOrEqual(greedyFirstFit(jobs).totalPriority);
  });
});
