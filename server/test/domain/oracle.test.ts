import { describe, expect, it } from 'vitest';
import type { Job } from '../../src/domain/model/job.ts';
import type { Machine } from '../../src/domain/model/machine.ts';
import { solve } from '../../src/domain/scheduling/solver.ts';
import { job, machine, M1, M2 } from './fixtures.ts';
import { bruteForceSchedule } from './oracle.ts';
import { expectValidSchedule } from './validity.ts';

/** Small deterministic PRNG so failures are reproducible from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInstance(seed: number, horizon: number): { jobs: Job[]; machines: Machine[] } {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  const n = int(3, 5);
  const machines = [M1, rnd() < 0.15 ? machine('M2', 'UNAVAILABLE') : M2];
  // dependencies only point to jobs earlier in a random order, so the graph is acyclic
  // while still allowing a dependency with a higher ID than its dependent
  const order = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);

  const jobs = Array.from({ length: n }, (_, i) => {
    const duration = int(1, 4);
    const releaseTime = int(0, 3);
    const rank = order.indexOf(i);
    const dependencies = order
      .slice(0, rank)
      .filter(() => rnd() < 0.35)
      .map((k) => `J${k + 1}`);
    // mostly single-machine jobs and tight windows, so jobs genuinely compete for slots
    const eligible = rnd() < 0.35 ? ['M1', 'M2'] : [rnd() < 0.5 ? 'M1' : 'M2'];
    return job(`J${i + 1}`, {
      duration,
      releaseTime,
      deadline: releaseTime + duration + int(-1, 3),
      priority: int(1, 10),
      eligibleMachines: eligible,
      dependencies,
    });
  });
  return { jobs, machines };
}

describe('solver vs brute-force oracle (differential)', () => {
  const horizon = 8;

  it('agrees with the oracle on 200 seeded random instances', () => {
    const coverage = { dependencyScheduled: 0, someExcluded: 0, displaced: 0, parallel: 0 };

    for (let seed = 1; seed <= 200; seed++) {
      const { jobs, machines } = randomInstance(seed, horizon);
      const expected = bruteForceSchedule(jobs, machines, horizon);
      const actual = solve({ jobs, machines, horizon });

      const scheduledIds = new Set(actual.assignments.map((a) => a.jobId));
      if (jobs.some((j) => j.dependencies.length > 0 && scheduledIds.has(j.id))) coverage.dependencyScheduled++;
      if (actual.exclusions.length > 0) coverage.someExcluded++;
      if (actual.exclusions.some((e) => e.code === 'DISPLACED')) coverage.displaced++;
      if (actual.assignments.some((a) => actual.assignments.some((b) => a.jobId < b.jobId && a.start < b.end && b.start < a.end))) {
        coverage.parallel++;
      }

      const context = `seed ${seed}: ${JSON.stringify(jobs)}`;
      expect(actual.totalPriority, `priority, ${context}`).toBe(expected.totalPriority);
      expect(actual.scheduledCount, `count, ${context}`).toBe(expected.scheduledCount);
      expect(actual.makespan, `makespan, ${context}`).toBe(expected.makespan);
      expect(actual.assignments, `assignments, ${context}`).toEqual(expected.assignments);
      expectValidSchedule(jobs, machines, actual, horizon);
    }

    // the comparison is only meaningful if the random instances exercise the hard parts
    expect(coverage.dependencyScheduled).toBeGreaterThan(30);
    expect(coverage.someExcluded).toBeGreaterThan(30);
    expect(coverage.displaced).toBeGreaterThan(10);
    expect(coverage.parallel).toBeGreaterThan(30);
  });
});

describe('solver stress (8 jobs, 3 machines, 12 slots)', () => {
  const machines = [M1, M2, machine('M3')];
  const all = ['M1', 'M2', 'M3'];

  it('proves an over-subscribed instance optimal quickly (eight 5-slot jobs fit only six)', () => {
    const jobs = Array.from({ length: 8 }, (_, i) =>
      job(`J${i + 1}`, { duration: 5, priority: 5, eligibleMachines: all }),
    );
    const started = performance.now();
    const result = solve({ jobs, machines });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.scheduledCount).toBe(6);
    expectValidSchedule(jobs, machines, result);
  });

  it('handles tight windows with dependency chains quickly', () => {
    const jobs = [
      job('J1', { duration: 3, deadline: 6, priority: 9, eligibleMachines: ['M1', 'M2'] }),
      job('J2', { duration: 2, deadline: 8, priority: 8, eligibleMachines: ['M1'], dependencies: ['J1'] }),
      job('J3', { duration: 4, deadline: 9, priority: 7, eligibleMachines: ['M2', 'M3'], dependencies: ['J1'] }),
      job('J4', { duration: 3, deadline: 7, priority: 6, eligibleMachines: ['M3'] }),
      job('J5', { duration: 2, releaseTime: 3, deadline: 10, priority: 6, eligibleMachines: all, dependencies: ['J2', 'J4'] }),
      job('J6', { duration: 5, deadline: 11, priority: 5, eligibleMachines: ['M1', 'M3'] }),
      job('J7', { duration: 4, releaseTime: 2, deadline: 12, priority: 4, eligibleMachines: all, dependencies: ['J3'] }),
      job('J8', { duration: 3, deadline: 12, priority: 3, eligibleMachines: all }),
    ];
    const started = performance.now();
    const result = solve({ jobs, machines });
    expect(performance.now() - started).toBeLessThan(1000);
    expectValidSchedule(jobs, machines, result);
  });

  it('handles eight identical-priority jobs competing for one machine quickly', () => {
    const jobs = Array.from({ length: 8 }, (_, i) =>
      job(`J${i + 1}`, { duration: 2 + (i % 2), priority: 5, eligibleMachines: ['M1'], deadline: 12 }),
    );
    const started = performance.now();
    const result = solve({ jobs, machines });
    expect(performance.now() - started).toBeLessThan(1000);
    expectValidSchedule(jobs, machines, result);
  });
});
