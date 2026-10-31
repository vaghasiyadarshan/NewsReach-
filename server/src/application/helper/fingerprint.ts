import { createHash } from 'node:crypto';
import type { Job } from '../../domain/models/job.ts';
import type { Machine } from '../../domain/models/machine.ts';
import type { ScheduleInputSnapshot } from '../../domain/models/schedule.ts';

/** JSON with object keys sorted at every level, so equal data always serializes identically. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function snapshotOf(jobs: readonly Job[], machines: readonly Machine[]): ScheduleInputSnapshot {
  return { jobs: [...jobs].sort(byId), machines: [...machines].sort(byId) };
}

/**
 * Hash of everything a schedule depends on: every job field (including input data), dependencies,
 * eligible machines, and machine statuses. If the current hash differs from the one stored with a
 * schedule, that schedule is stale. Unlike timestamps this ignores no-op edits and clock skew.
 */
export function computeFingerprint(snapshot: ScheduleInputSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex');
}
