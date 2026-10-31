import type { Job } from '../model/job.ts';
import type { Machine } from '../model/machine.ts';
import type { Exclusion } from '../model/schedule.ts';
import { compareStrings } from './compare.ts';
import { topologicalOrder } from './graph.ts';

/** A job that survived the pre-checks and may take part in the search. */
export interface Candidate {
  job: Job;
  /** Eligible machines that exist and are AVAILABLE, sorted. */
  usableMachines: string[];
  /** Earliest possible start considering release time and dependency chains (necessary, not sufficient). */
  earliestStart: number;
}

export interface FeasibilityResult {
  /** Sorted by job ID. */
  candidates: Candidate[];
  /** Sorted by job ID. */
  exclusions: Exclusion[];
}

function windowReason(finish: number, limit: number, job: Job, horizon: number, afterDeps: boolean): string {
  const bound =
    job.deadline > horizon
      ? `slot ${limit} (the planning horizon; deadline is ${job.deadline})`
      : `its deadline, slot ${limit}`;
  const when = afterDeps ? ' once its dependencies have finished' : '';
  return `Earliest possible finish is slot ${finish}${when}, but it must finish by ${bound}.`;
}

/**
 * Cheap, exact-for-single-job checks that remove jobs which can never be scheduled, in this order:
 * no available eligible machine, own window too small, excluded dependency, window too small once
 * dependency chains are considered. Exclusion propagates to every transitive dependent.
 * Assumes the dependency graph is already valid.
 */
export function analyzeFeasibility(
  jobs: readonly Job[],
  machines: readonly Machine[],
  horizon: number,
): FeasibilityResult {
  const available = new Set(machines.filter((m) => m.status === 'AVAILABLE').map((m) => m.id));
  const byId = new Map(jobs.map((j) => [j.id, j] as const));
  const excluded = new Map<string, Exclusion>();
  const candidates = new Map<string, Candidate>();

  for (const id of topologicalOrder(jobs)) {
    const job = byId.get(id)!;
    const limit = Math.min(job.deadline, horizon);

    const usableMachines = job.eligibleMachines.filter((m) => available.has(m)).sort(compareStrings);
    if (usableMachines.length === 0) {
      const eligible = [...job.eligibleMachines].sort(compareStrings).join(', ') || 'none listed';
      excluded.set(id, {
        jobId: id,
        code: 'NO_AVAILABLE_MACHINE',
        reason: `None of its eligible machines (${eligible}) is available.`,
      });
      continue;
    }

    const ownFinish = job.releaseTime + job.duration;
    if (ownFinish > limit) {
      excluded.set(id, {
        jobId: id,
        code: 'WINDOW_TOO_SMALL',
        reason: windowReason(ownFinish, limit, job, horizon, false),
      });
      continue;
    }

    const excludedDeps = job.dependencies.filter((d) => excluded.has(d)).sort(compareStrings);
    if (excludedDeps.length > 0) {
      excluded.set(id, {
        jobId: id,
        code: 'DEPENDENCY_EXCLUDED',
        reason: `Depends on excluded job ${excludedDeps.join(', ')}.`,
      });
      continue;
    }

    const earliestStart = Math.max(
      job.releaseTime,
      ...job.dependencies.map((d) => {
        const dep = candidates.get(d)!;
        return dep.earliestStart + dep.job.duration;
      }),
    );
    const chainFinish = earliestStart + job.duration;
    if (chainFinish > limit) {
      excluded.set(id, {
        jobId: id,
        code: 'WINDOW_TOO_SMALL',
        reason: windowReason(chainFinish, limit, job, horizon, true),
      });
      continue;
    }

    candidates.set(id, { job, usableMachines, earliestStart });
  }

  return {
    candidates: [...candidates.values()].sort((a, b) => compareStrings(a.job.id, b.job.id)),
    exclusions: [...excluded.values()].sort((a, b) => compareStrings(a.jobId, b.jobId)),
  };
}
