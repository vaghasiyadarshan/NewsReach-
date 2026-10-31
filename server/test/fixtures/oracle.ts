import type { Job } from '../../src/domain/models/job.ts';
import type { Machine } from '../../src/domain/models/machine.ts';
import type { Assignment } from '../../src/domain/models/schedule.ts';

/**
 * Deliberately naive reference scheduler used to cross-check the real solver. It shares no logic
 * with it: no subset enumeration, no memoization, no iterative deepening. It tries every
 * "skip or (start, machine)" choice for every job, keeps the valid complete schedules, and picks
 * the best by the four rules of the brief using a hand-written comparator.
 */
export interface OracleResult {
  assignments: Assignment[];
  totalPriority: number;
  scheduledCount: number;
  makespan: number;
}

export function bruteForceSchedule(jobs: readonly Job[], machines: readonly Machine[], horizon: number): OracleResult {
  const sorted = [...jobs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const available = new Set(machines.filter((m) => m.status === 'AVAILABLE').map((m) => m.id));
  const priorityOf = new Map(sorted.map((j) => [j.id, j.priority] as const));

  let best: OracleResult = { assignments: [], totalPriority: 0, scheduledCount: 0, makespan: 0 };
  const chosen: Assignment[] = [];

  const consider = (): void => {
    const byId = new Map(chosen.map((a) => [a.jobId, a] as const));
    for (const a of chosen) {
      const job = sorted.find((j) => j.id === a.jobId)!;
      for (const dep of job.dependencies) {
        const d = byId.get(dep);
        if (!d || d.end > a.start) return; // dependency missing or not finished yet
      }
    }
    const candidate: OracleResult = {
      assignments: chosen.map((a) => ({ ...a })),
      totalPriority: chosen.reduce((s, a) => s + priorityOf.get(a.jobId)!, 0),
      scheduledCount: chosen.length,
      makespan: chosen.reduce((m, a) => Math.max(m, a.end), 0),
    };
    if (isBetter(candidate, best)) best = candidate;
  };

  const recurse = (i: number): void => {
    if (i === sorted.length) {
      consider();
      return;
    }
    const job = sorted[i]!;
    recurse(i + 1); // skip this job
    for (let start = job.releaseTime; start + job.duration <= Math.min(job.deadline, horizon); start++) {
      for (const machineId of job.eligibleMachines) {
        if (!available.has(machineId)) continue;
        const end = start + job.duration;
        if (chosen.some((c) => c.machineId === machineId && start < c.end && c.start < end)) continue;
        chosen.push({ jobId: job.id, machineId, start, end });
        recurse(i + 1);
        chosen.pop();
      }
    }
  };

  recurse(0);
  return best;
}

function isBetter(a: OracleResult, b: OracleResult): boolean {
  if (a.totalPriority !== b.totalPriority) return a.totalPriority > b.totalPriority;
  if (a.scheduledCount !== b.scheduledCount) return a.scheduledCount > b.scheduledCount;
  if (a.makespan !== b.makespan) return a.makespan < b.makespan;
  for (let i = 0; i < Math.min(a.assignments.length, b.assignments.length); i++) {
    const x = a.assignments[i]!;
    const y = b.assignments[i]!;
    if (x.jobId !== y.jobId) return x.jobId < y.jobId;
    if (x.start !== y.start) return x.start < y.start;
    if (x.machineId !== y.machineId) return x.machineId < y.machineId;
  }
  return false;
}
