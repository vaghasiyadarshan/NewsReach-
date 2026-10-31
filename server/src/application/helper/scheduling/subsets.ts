import type { Candidate } from './feasibility.ts';

/** A set of candidates (bit i = candidates[i]) that is closed under dependencies. */
export interface Subset {
  mask: number;
  priority: number;
  count: number;
}

/** Every dependency-closed subset of the candidates, best first by (priority, count). */
export function listDependencyClosedSubsets(
  candidates: readonly Candidate[],
  dependencyMasks: readonly number[],
): Subset[] {
  const n = candidates.length;
  const subsets: Subset[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    let priority = 0;
    let count = 0;
    let closed = true;
    for (let i = 0; i < n && closed; i++) {
      if (!(mask & (1 << i))) continue;
      if ((dependencyMasks[i]! & ~mask) !== 0) closed = false;
      priority += candidates[i]!.job.priority;
      count++;
    }
    if (closed) subsets.push({ mask, priority, count });
  }
  return subsets.sort((a, b) => b.priority - a.priority || b.count - a.count || a.mask - b.mask);
}

/** The smallest dependency-closed subset containing candidate `index`: itself plus all its dependencies. */
export function maskWithDependencies(index: number, dependencyMasks: readonly number[]): number {
  let mask = 1 << index;
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = 0; i < dependencyMasks.length; i++) {
      if (mask & (1 << i) && (dependencyMasks[i]! & ~mask) !== 0) {
        mask |= dependencyMasks[i]!;
        grew = true;
      }
    }
  }
  return mask;
}
