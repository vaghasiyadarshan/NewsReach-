import type { Clock } from '../../application/port/clock.ts';
import { CreateJob } from '../../application/useCase/create-job.ts';
import { GenerateSchedule } from '../../application/useCase/generate-schedule.ts';
import { GetDashboard } from '../../application/useCase/get-dashboard.ts';
import { GetExecution } from '../../application/useCase/get-execution.ts';
import { GetJob } from '../../application/useCase/get-job.ts';
import { GetLatestSchedule } from '../../application/useCase/get-latest-schedule.ts';
import { ListExecutions } from '../../application/useCase/list-executions.ts';
import { ListJobs } from '../../application/useCase/list-jobs.ts';
import { ListMachines } from '../../application/useCase/list-machines.ts';
import { ResetSampleData } from '../../application/useCase/reset-sample-data.ts';
import { RunSchedule } from '../../application/useCase/run-schedule.ts';
import { UpdateJob } from '../../application/useCase/update-job.ts';
import type { Pool } from '../orm/pool.ts';
import { PostgresRunLock } from '../Service/postgres-run-lock.ts';
import { PostgresUnitOfWork } from '../repositories/unit-of-work.ts';
import { SystemClock } from '../Service/system-clock.ts';

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
