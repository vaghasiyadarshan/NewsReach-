import type { ApiErrorBody, Dashboard, RunResultDto, ScheduleDto } from './types.ts';

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

async function request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API. Is the server running?');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string }>('GET', '/api/health'),
  dashboard: () => request<Dashboard>('GET', '/api/dashboard'),
  generateSchedule: () => request<ScheduleDto>('POST', '/api/schedules/generate'),
  runSchedule: () => request<RunResultDto>('POST', '/api/schedules/run'),
  resetSample: () => request<{ machines: number; jobs: number }>('POST', '/api/dev/reset-sample'),
};
