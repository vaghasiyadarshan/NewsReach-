import type { Clock } from './application/ports/clock.ts';
import { CreateJob } from './application/use-cases/create-job.ts';
import { GenerateSchedule } from './application/use-cases/generate-schedule.ts';
import { GetDashboard } from './application/use-cases/get-dashboard.ts';
import { GetExecution } from './application/use-cases/get-execution.ts';
import { GetJob } from './application/use-cases/get-job.ts';
import { GetLatestSchedule } from './application/use-cases/get-latest-schedule.ts';
import { ListExecutions } from './application/use-cases/list-executions.ts';
import { ListJobs } from './application/use-cases/list-jobs.ts';
import { ListMachines } from './application/use-cases/list-machines.ts';
import { ResetSampleData } from './application/use-cases/reset-sample-data.ts';
import { RunSchedule } from './application/use-cases/run-schedule.ts';
import { UpdateJob } from './application/use-cases/update-job.ts';
import type { Pool } from './infrastructure/postgres/pool.ts';
import { PostgresRunLock } from './infrastructure/postgres/run-lock.ts';
import { PostgresUnitOfWork } from './infrastructure/postgres/unit-of-work.ts';
import { SystemClock } from './infrastructure/system-clock.ts';

export interface UseCases {
  createJob: CreateJob;
  updateJob: UpdateJob;
  getJob: GetJob;
  listJobs: ListJobs;
  listMachines: ListMachines;
  generateSchedule: GenerateSchedule;
  getLatestSchedule: GetLatestSchedule;
  runSchedule: RunSchedule;
  listExecutions: ListExecutions;
  getExecution: GetExecution;
  getDashboard: GetDashboard;
  resetSampleData: ResetSampleData;
}

/**
 * The composition root: the one place that picks concrete adapters for the application's ports.
 * Everything else depends on interfaces only.
 */
export function createUseCases(pool: Pool, clock: Clock = new SystemClock()): UseCases {
  const uow = new PostgresUnitOfWork(pool);
  const lock = new PostgresRunLock(pool);

  return {
    createJob: new CreateJob(uow),
    updateJob: new UpdateJob(uow),
    getJob: new GetJob(uow),
    listJobs: new ListJobs(uow),
    listMachines: new ListMachines(uow),
    generateSchedule: new GenerateSchedule(uow, clock),
    getLatestSchedule: new GetLatestSchedule(uow),
    runSchedule: new RunSchedule(uow, clock, lock),
    listExecutions: new ListExecutions(uow),
    getExecution: new GetExecution(uow),
    getDashboard: new GetDashboard(uow),
    resetSampleData: new ResetSampleData(uow),
  };
}
