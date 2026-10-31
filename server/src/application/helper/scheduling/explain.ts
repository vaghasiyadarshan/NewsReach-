import type { Exclusion } from '../../../domain/models/schedule.ts';
import type { Candidate } from './feasibility.ts';
import type { SubsetPlacer } from './placement.ts';
import { maskWithDependencies, type Subset } from './subsets.ts';

interface ExplainContext {
  candidates: readonly Candidate[];
  dependencyMasks: readonly number[];
  /** All dependency-closed subsets, best (priority, count) first. */
  subsets: readonly Subset[];
  placer: SubsetPlacer;
  /** The optimal subset the solver selected. */
  chosen: Subset;
}

/**
 * Explains why each candidate outside the chosen subset was left out, exactly rather than by
 * heuristic: it finds the best schedule that would have to include the job and reports what that
 * would cost compared with the chosen optimum.
 */
export function explainExcludedJobs(ctx: ExplainContext): Exclusion[] {
  const { candidates, dependencyMasks, subsets, placer, chosen } = ctx;
  const exclusions: Exclusion[] = [];

  candidates.forEach((candidate, index) => {
    if (chosen.mask & (1 << index)) return;
    const jobId = candidate.job.id;

    const required = maskWithDependencies(index, dependencyMasks);
    if (placer.placeJobs(required) === null) {
      exclusions.push({
        jobId,
        code: 'WINDOW_TOO_SMALL',
        reason:
          'It cannot be scheduled together with its dependencies: their time windows and eligible machines leave no feasible placement.',
      });
      return;
    }

    const forced = subsets.find((s) => (s.mask & required) === required && placer.placeJobs(s.mask) !== null)!;
    exclusions.push({ jobId, code: 'DISPLACED', reason: explainDisplacement(forced, chosen) });
  });

  return exclusions;
}

function explainDisplacement(forced: Subset, chosen: Subset): string {
  if (forced.priority < chosen.priority) {
    return `Including it would lower the total priority from ${chosen.priority} to ${forced.priority}.`;
  }
  if (forced.count < chosen.count) {
    return `Including it would keep the total priority at ${chosen.priority} but lower the number of scheduled jobs from ${chosen.count} to ${forced.count}.`;
  }
  return `Including it ties on total priority (${chosen.priority}) and job count (${chosen.count}), but gives a later makespan or a lexicographically larger schedule.`;
}
