import type { ApiErrorBody, Dashboard, JobDto, RunResultDto, ScheduleDto } from './types.ts';

/** A failed API call, carrying the server's code, message and details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The text to show a person for any failure. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong';

/** One invalid field reported by the server: `{ field: "priority", message: "must be ..." }`. */
export interface FieldIssue {
  field: string;
  message: string;
}

/** The per-field problems of a 400 response, or an empty list for any other failure. */
export function fieldIssuesOf(error: unknown): FieldIssue[] {
  if (!(error instanceof ApiError)) return [];
  const issues = error.details?.issues;
  return Array.isArray(issues) ? (issues as FieldIssue[]) : [];
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API. Is the server running?');
  }

  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (parsed as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }
  return parsed as T;
}

/** What the job form sends. Values are unchecked on purpose: the server validates and explains. */
export type JobInput = Record<string, unknown>;

export const api = {
  health: () => request<{ status: string }>('GET', '/api/health'),
  dashboard: () => request<Dashboard>('GET', '/api/dashboard'),
  generateSchedule: () => request<ScheduleDto>('POST', '/api/schedules/generate'),
  runSchedule: () => request<RunResultDto>('POST', '/api/schedules/run'),
  resetSample: () => request<{ machines: number; jobs: number }>('POST', '/api/dev/reset-sample'),
  listJobs: () => request<JobDto[]>('GET', '/api/jobs'),
  createJob: (job: JobInput) => request<JobDto>('POST', '/api/jobs', job),
  updateJob: (id: string, job: JobInput) => request<JobDto>('PUT', `/api/jobs/${encodeURIComponent(id)}`, job),
};
