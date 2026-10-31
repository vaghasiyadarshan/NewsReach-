import { GraphError, MissingReferenceError } from '../model/errors.ts';
import type { Job } from '../model/job.ts';

export type GraphNode = Pick<Job, 'id' | 'dependencies'>;

/** Dependency IDs that no job in `jobs` defines (sorted, de-duplicated). */
export function findMissingReferences(jobs: readonly GraphNode[]): string[] {
  const known = new Set(jobs.map((j) => j.id));
  const missing = new Set<string>();
  for (const job of jobs) {
    for (const dep of job.dependencies) {
      if (!known.has(dep)) missing.add(dep);
    }
  }
  return [...missing].sort();
}

/**
 * Finds a dependency cycle by following "depends on" edges.
 * Returns the path closed on its start, e.g. ['J1', 'J2', 'J1'], or null.
 * Unknown references are ignored (check them with findMissingReferences).
 */
export function findCycle(jobs: readonly GraphNode[]): string[] | null {
  const byId = new Map(jobs.map((j) => [j.id, j] as const));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const current = state.get(id);
    if (current === 'done') return null;
    if (current === 'visiting') return [...stack.slice(stack.indexOf(id)), id];

    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of [...(byId.get(id)?.dependencies ?? [])].sort()) {
      if (!byId.has(dep)) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const id of [...byId.keys()].sort()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

/** Throws MissingReferenceError or GraphError when the graph is not a valid DAG. */
export function assertValidGraph(jobs: readonly GraphNode[]): void {
  const missing = findMissingReferences(jobs);
  if (missing.length > 0) throw new MissingReferenceError('dependency', missing);
  const cycle = findCycle(jobs);
  if (cycle) throw new GraphError(cycle);
}

/** Job IDs ordered so every job comes after its dependencies (deterministic; graph must be a DAG). */
export function topologicalOrder(jobs: readonly GraphNode[]): string[] {
  const byId = new Map(jobs.map((j) => [j.id, j] as const));
  const seen = new Set<string>();
  const order: string[] = [];

  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of [...(byId.get(id)?.dependencies ?? [])].sort()) {
      if (byId.has(dep)) visit(dep);
    }
    order.push(id);
  };

  for (const id of [...byId.keys()].sort()) visit(id);
  return order;
}

/** All jobs that `jobId` depends on, directly or indirectly (excluding itself). */
export function transitiveDependencies(jobId: string, jobs: readonly GraphNode[]): Set<string> {
  const byId = new Map(jobs.map((j) => [j.id, j] as const));
  const seen = new Set<string>();
  const walk = (id: string): void => {
    for (const dep of byId.get(id)?.dependencies ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      walk(dep);
    }
  };
  walk(jobId);
  return seen;
}

/** All jobs that depend on `jobId`, directly or indirectly (excluding itself). */
export function transitiveDependents(jobId: string, jobs: readonly GraphNode[]): Set<string> {
  return new Set(
    jobs.filter((j) => j.id !== jobId && transitiveDependencies(j.id, jobs).has(jobId)).map((j) => j.id),
  );
}
