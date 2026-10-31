import { SAMPLE_JOBS } from '../../src/application/sample-data.ts';
import type { Job } from '../../src/domain/model/job.ts';
import type { Machine } from '../../src/domain/model/machine.ts';

export function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    name: `Job ${id}`,
    operationType: 'COUNT_WORDS',
    duration: 1,
    releaseTime: 0,
    deadline: 12,
    priority: 5,
    eligibleMachines: ['M1', 'M2'],
    dependencies: [],
    inputData: {},
    ...overrides,
  };
}

export function machine(id: string, status: Machine['status'] = 'AVAILABLE'): Machine {
  return { id, name: `Processing Machine ${id}`, status };
}

export const M1 = machine('M1');
export const M2 = machine('M2');

/** The six sample jobs from the assessment brief (same data the app seeds). */
export function sampleJobs(): Job[] {
  return structuredClone([...SAMPLE_JOBS]);
}
