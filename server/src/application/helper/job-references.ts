import { MissingReferenceError } from '../errors/errors.ts';
import type { Job } from '../../domain/models/job.ts';
import type { Machine } from '../../domain/models/machine.ts';
import { assertValidGraph } from './scheduling/graph.ts';

/**
 * Checks that `job` refers only to machines and jobs that exist and that adding or replacing it
 * leaves the dependency graph acyclic. `otherJobs` are all stored jobs except `job` itself, so a
 * self dependency is reported as a cycle rather than as a missing reference.
 */
export function assertJobFitsGraph(job: Job, otherJobs: readonly Job[], machines: readonly Machine[]): void {
  const knownMachines = new Set(machines.map((m) => m.id));
  const unknownMachines = job.eligibleMachines.filter((m) => !knownMachines.has(m));
  if (unknownMachines.length > 0) throw new MissingReferenceError('machine', unknownMachines);

  assertValidGraph([...otherJobs, job]);
}
