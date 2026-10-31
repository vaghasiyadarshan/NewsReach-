import { expect } from 'vitest';
import type { Job } from '../../src/domain/model/job.ts';
import type { Machine } from '../../src/domain/model/machine.ts';
import type { ScheduleResult } from '../../src/domain/model/schedule.ts';

/** Independently asserts every hard constraint of the brief on a produced schedule. */
export function expectValidSchedule(
  jobs: readonly Job[],
  machines: readonly Machine[],
  result: ScheduleResult,
  horizon = 12,
): void {
  const byId = new Map(jobs.map((j) => [j.id, j] as const));
  const available = new Set(machines.filter((m) => m.status === 'AVAILABLE').map((m) => m.id));
  const assigned = new Map(result.assignments.map((a) => [a.jobId, a] as const));

  // each job at most once
  expect(assigned.size).toBe(result.assignments.length);

  for (const a of result.assignments) {
    const j = byId.get(a.jobId)!;
    expect(j, `unknown job ${a.jobId}`).toBeDefined();
    expect(a.end - a.start, `${a.jobId} duration`).toBe(j.duration);
    expect(a.start, `${a.jobId} release`).toBeGreaterThanOrEqual(j.releaseTime);
    expect(a.end, `${a.jobId} deadline`).toBeLessThanOrEqual(Math.min(j.deadline, horizon));
    expect(j.eligibleMachines, `${a.jobId} eligibility`).toContain(a.machineId);
    expect(available.has(a.machineId), `${a.jobId} machine available`).toBe(true);

    // dependencies are selected and finish before this job starts
    for (const dep of j.dependencies) {
      const d = assigned.get(dep);
      expect(d, `${a.jobId} needs ${dep} scheduled`).toBeDefined();
      expect(d!.end, `${dep} must finish before ${a.jobId} starts`).toBeLessThanOrEqual(a.start);
    }
  }

  // one job at a time per machine (half-open intervals)
  for (const x of result.assignments) {
    for (const y of result.assignments) {
      if (x.jobId >= y.jobId || x.machineId !== y.machineId) continue;
      const overlap = x.start < y.end && y.start < x.end;
      expect(overlap, `${x.jobId} and ${y.jobId} overlap on ${x.machineId}`).toBe(false);
    }
  }

  // summary figures agree with the assignments
  expect(result.scheduledCount).toBe(result.assignments.length);
  expect(result.totalPriority).toBe(result.assignments.reduce((s, a) => s + byId.get(a.jobId)!.priority, 0));
  expect(result.makespan).toBe(result.assignments.reduce((m, a) => Math.max(m, a.end), 0));

  // every job is either scheduled or excluded, never both
  const excluded = new Set(result.exclusions.map((e) => e.jobId));
  for (const j of jobs) {
    expect(assigned.has(j.id) !== excluded.has(j.id), `${j.id} scheduled xor excluded`).toBe(true);
  }
}
