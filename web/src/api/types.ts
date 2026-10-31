// API types are the server's own read models (type-only imports, so no server code is bundled).
// JSON has no Date, so every Date becomes the ISO string it is sent as.
import type { Machine } from '../../../server/src/domain/models/machine.ts';
import type {
  DashboardView,
  ExecutionDetails,
  ExecutionRecord,
  JobView,
  RunResult,
  ScheduleView,
} from '../../../server/src/domain/types/views.ts';

type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type Dashboard = Serialized<DashboardView>;
export type JobRowDto = Dashboard['jobs'][number];
export type MachineLoadDto = Dashboard['machines'][number];
export type SchedulerSummaryDto = NonNullable<Dashboard['schedule']>;
export type ScheduleDto = Serialized<ScheduleView>;
export type RunResultDto = Serialized<RunResult>;
export type ExecutionRecordDto = Serialized<ExecutionRecord>;
export type ExecutionDetailsDto = Serialized<ExecutionDetails>;
export type JobDto = Serialized<JobView>;
export type MachineDto = Machine;

export type { JobStatus } from '../../../server/src/domain/models/execution.ts';

/** The error body every failed API call returns. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
