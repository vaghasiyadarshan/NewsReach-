import { InvalidTransitionError } from '../model/errors.ts';
import type { ExecutionStatus } from '../model/execution.ts';
import type { ScheduleStatus } from '../model/schedule.ts';

/**
 * The only legal status changes. Executions are created SCHEDULED; COMPLETED, FAILED and BLOCKED
 * are final. Anything else (for example COMPLETED -> RUNNING, which would re-execute a finished
 * job) is refused.
 */
const ALLOWED: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  SCHEDULED: ['RUNNING', 'BLOCKED'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
};

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isFinal(status: ExecutionStatus): boolean {
  return ALLOWED[status].length === 0;
}

/**
 * A schedule's status is derived from its executions, never stored, so assigning jobs to machines
 * can never make a schedule look finished. A schedule with nothing to run has nothing pending.
 */
export function deriveScheduleStatus(statuses: readonly ExecutionStatus[]): ScheduleStatus {
  if (statuses.length === 0) return 'COMPLETED';
  if (statuses.every((s) => s === 'SCHEDULED')) return 'GENERATED';
  if (!statuses.every(isFinal)) return 'RUNNING';
  return statuses.every((s) => s === 'COMPLETED') ? 'COMPLETED' : 'COMPLETED_WITH_FAILURES';
}
