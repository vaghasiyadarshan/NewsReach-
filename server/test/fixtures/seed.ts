import { SAMPLE_JOBS, SAMPLE_MACHINES } from '../../src/application/constants/sample-data.ts';
import type { Repositories } from '../../src/application/port/repositories.ts';

/** Loads the brief's two machines and six jobs straight through the repositories. */
export async function seedSample(repos: Repositories): Promise<void> {
  await repos.machines.insertMany(structuredClone([...SAMPLE_MACHINES]));
  for (const job of SAMPLE_JOBS) await repos.jobs.insert(structuredClone(job));
}
