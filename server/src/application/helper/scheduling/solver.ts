import { LimitExceededError } from '../../errors/errors.ts';
import type { Job } from '../../../domain/models/job.ts';
import type { Machine } from '../../../domain/models/machine.ts';
import type { Assignment, ScheduleResult } from '../../../domain/models/schedule.ts';
import { compareStrings } from './compare.ts';
import { explainUnselected } from './explain.ts';
import { analyzeFeasibility } from './feasibility.ts';
import { assertValidGraph } from './graph.ts';
import { HORIZON, MAX_JOBS, MAX_MACHINES } from '../../constants/limits.ts';
import { SubsetPlacer, type Placement } from './placement.ts';
import { enumerateClosedSubsets, type Subset } from './subsets.ts';

export interface SolverInput {
  jobs: readonly Job[];
  machines: readonly Machine[];
  /** Planning horizon in slots; defaults to 12. */
  horizon?: number;
}

export interface SolverStats {
  /** Dependency-closed job subsets among the candidates. */
  subsetsConsidered: number;
  /** Search nodes visited by the placement search. */
  nodesVisited: number;
  elapsedMs: number;
}

export type SolverOutput = ScheduleResult & { stats: SolverStats };

/** Compares two assignment lists by (jobId, start, machineId), job by job. */
export function compareAssignments(a: readonly Assignment[], b: readonly Assignment[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    const byJob = compareStrings(x.jobId, y.jobId);
    if (byJob !== 0) return byJob;
    if (x.start !== y.start) return x.start - y.start;
    const byMachine = compareStrings(x.machineId, y.machineId);
    if (byMachine !== 0) return byMachine;
  }
  return a.length - b.length;
}

/** True when placement `a` beats `b`: smaller makespan, then lexicographically smaller. */
function isBetter(a: Placement, b: Placement): boolean {
  if (a.makespan !== b.makespan) return a.makespan < b.makespan;
  return compareAssignments(a.assignments, b.assignments) < 0;
}

function assertWithinLimits(jobs: readonly Job[], machines: readonly Machine[]): void {
  if (jobs.length > MAX_JOBS) {
    throw new LimitExceededError(`Too many jobs: ${jobs.length} (the scheduler supports at most ${MAX_JOBS}).`);
  }
  if (machines.length > MAX_MACHINES) {
    throw new LimitExceededError(
      `Too many machines: ${machines.length} (the scheduler supports at most ${MAX_MACHINES}).`,
    );
  }
}

/**
 * Computes the optimal feasible schedule, in this order of preference: maximum total priority,
 * maximum number of jobs, minimum makespan, lexicographically smallest (jobId, start, machineId).
 *
 * Subsets are tried best-score first; the first score level that contains a schedulable subset
 * decides priority and count, and the remaining criteria are compared across that level's subsets.
 */
export function solve(input: SolverInput): SolverOutput {
  const startedAt = performance.now();
  const horizon = input.horizon ?? HORIZON;
  assertWithinLimits(input.jobs, input.machines);
  assertValidGraph(input.jobs);

  const { candidates, exclusions: unschedulable } = analyzeFeasibility(input.jobs, input.machines, horizon);
  const placer = new SubsetPlacer(candidates, horizon);
  const dependencyMasks = placer.dependencyMasks();
  const subsets = enumerateClosedSubsets(candidates, dependencyMasks);

  let chosen: { subset: Subset; placement: Placement } | null = null;
  for (let from = 0; from < subsets.length && chosen === null; ) {
    const { priority, count } = subsets[from]!;
    let to = from;
    while (to < subsets.length && subsets[to]!.priority === priority && subsets[to]!.count === count) to++;

    for (const subset of subsets.slice(from, to)) {
      const placement = placer.place(subset.mask);
      if (placement && (chosen === null || isBetter(placement, chosen.placement))) {
        chosen = { subset, placement };
      }
    }
    from = to;
  }
  // The empty subset is always schedulable, so a choice always exists.
  const { subset, placement } = chosen!;

  const unselected = explainUnselected({ candidates, dependencyMasks, subsets, placer, chosen: subset });

  return {
    assignments: placement.assignments,
    exclusions: [...unschedulable, ...unselected].sort((a, b) => compareStrings(a.jobId, b.jobId)),
    totalPriority: subset.priority,
    scheduledCount: subset.count,
    makespan: placement.makespan,
    stats: {
      subsetsConsidered: subsets.length,
      nodesVisited: placer.nodesVisited,
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    },
  };
}
