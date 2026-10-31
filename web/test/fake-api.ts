import { vi } from 'vitest';
import type { Dashboard } from '../src/api/types.ts';

export const emptyDashboard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
  horizon: 12,
  machines: [
    { id: 'M1', name: 'Processing Machine 1', status: 'AVAILABLE', jobs: [], busySlots: 0, horizon: 12, workloadPercent: 0 },
    { id: 'M2', name: 'Processing Machine 2', status: 'AVAILABLE', jobs: [], busySlots: 0, horizon: 12, workloadPercent: 0 },
  ],
  overview: { total: 6, scheduled: 0, running: 0, completed: 0, failed: 0, blocked: 0, unscheduled: 6 },
  jobs: [],
  schedule: null,
  ...overrides,
});

export const summary = (overrides: Partial<NonNullable<Dashboard['schedule']>> = {}): NonNullable<Dashboard['schedule']> => ({
  id: 1,
  createdAt: '2026-01-01T10:00:00.000Z',
  status: 'GENERATED',
  stale: false,
  totalPriority: 45,
  scheduledCount: 6,
  makespan: 7,
  exclusions: [],
  ...overrides,
});

type Handler = (body: unknown) => { status?: number; json: unknown };

/** Replaces `fetch` with a router keyed by "METHOD /path"; returns the list of calls made. */
export function installFakeApi(overrides: Record<string, Handler>) {
  // the Jobs panel loads its list on every dashboard load; most tests do not care about it
  const routes: Record<string, Handler> = { 'GET /api/jobs': () => ({ json: [] }), ...overrides };
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${path}`;
      calls.push(key);
      const handler = routes[key];
      if (!handler) throw new Error(`Unexpected request: ${key}`);
      const { status = 200, json } = handler(init?.body);
      return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

export const apiError = (status: number, code: string, message: string) => ({
  status,
  json: { error: { code, message } },
});
