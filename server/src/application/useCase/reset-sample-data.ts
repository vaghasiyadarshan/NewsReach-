import { SAMPLE_JOBS, SAMPLE_MACHINES } from '../constants/sample-data.ts';
import type { UnitOfWork } from '../port/repositories.ts';

export class ResetSampleData {
  constructor(private readonly uow: UnitOfWork) {}

  /** Replaces all data (including schedules and executions) with the brief's machines and jobs, atomically. */
  async execute(): Promise<{ machines: number; jobs: number }> {
    return this.uow.run(async (repos) => {
      await repos.devData.clearAll();
      await repos.machines.insertMany(structuredClone([...SAMPLE_MACHINES]));
      for (const job of SAMPLE_JOBS) await repos.jobs.insert(structuredClone(job));
      return { machines: SAMPLE_MACHINES.length, jobs: SAMPLE_JOBS.length };
    });
  }
}
