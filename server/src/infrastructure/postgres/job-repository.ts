import { ConflictError } from '../../domain/model/errors.ts';
import type { Job, JsonObject, OperationType } from '../../domain/model/job.ts';
import type { JobRepository } from '../../application/ports/repositories.ts';
import type { Queryable } from './pool.ts';
import { isForeignKeyViolation, isUniqueViolation } from './sql-errors.ts';

interface JobRow {
  id: string;
  name: string;
  operation_type: OperationType;
  duration: number;
  release_time: number;
  deadline: number;
  priority: number;
  input_data: JsonObject;
}

export class PostgresJobRepository implements JobRepository {
  constructor(private readonly q: Queryable) {}

  async list(): Promise<Job[]> {
    return this.load(null);
  }

  async findById(id: string): Promise<Job | null> {
    return (await this.load([id]))[0] ?? null;
  }

  async insert(job: Job): Promise<void> {
    try {
      await this.q.query(
        `INSERT INTO jobs (id, name, operation_type, duration, release_time, deadline, priority, input_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [job.id, job.name, job.operationType, job.duration, job.releaseTime, job.deadline, job.priority, JSON.stringify(job.inputData)],
      );
      await this.writeRelations(job);
    } catch (error) {
      throw this.translate(error, job.id);
    }
  }

  async update(job: Job): Promise<void> {
    try {
      await this.q.query(
        `UPDATE jobs
            SET name = $2, operation_type = $3, duration = $4, release_time = $5,
                deadline = $6, priority = $7, input_data = $8::jsonb, updated_at = now()
          WHERE id = $1`,
        [job.id, job.name, job.operationType, job.duration, job.releaseTime, job.deadline, job.priority, JSON.stringify(job.inputData)],
      );
      await this.q.query('DELETE FROM job_eligible_machines WHERE job_id = $1', [job.id]);
      await this.q.query('DELETE FROM job_dependencies WHERE job_id = $1', [job.id]);
      await this.writeRelations(job);
    } catch (error) {
      throw this.translate(error, job.id);
    }
  }

  private async writeRelations(job: Job): Promise<void> {
    await this.q.query(
      'INSERT INTO job_eligible_machines (job_id, machine_id) SELECT $1, unnest($2::text[])',
      [job.id, job.eligibleMachines],
    );
    if (job.dependencies.length > 0) {
      await this.q.query(
        'INSERT INTO job_dependencies (job_id, depends_on_id) SELECT $1, unnest($2::text[])',
        [job.id, job.dependencies],
      );
    }
  }

  /** Loads jobs (all, or just `ids`) with their eligible machines and dependencies. */
  private async load(ids: string[] | null): Promise<Job[]> {
    const jobs = await this.q.query<JobRow>(
      `SELECT id, name, operation_type, duration, release_time, deadline, priority, input_data
         FROM jobs WHERE ($1::text[] IS NULL OR id = ANY($1)) ORDER BY id COLLATE "C"`,
      [ids],
    );
    const machines = await this.q.query<{ job_id: string; machine_id: string }>(
      `SELECT job_id, machine_id FROM job_eligible_machines
        WHERE ($1::text[] IS NULL OR job_id = ANY($1)) ORDER BY machine_id COLLATE "C"`,
      [ids],
    );
    const deps = await this.q.query<{ job_id: string; depends_on_id: string }>(
      `SELECT job_id, depends_on_id FROM job_dependencies
        WHERE ($1::text[] IS NULL OR job_id = ANY($1)) ORDER BY depends_on_id COLLATE "C"`,
      [ids],
    );

    const group = <T>(rows: T[], key: (r: T) => string, value: (r: T) => string) => {
      const map = new Map<string, string[]>();
      for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), value(r)]);
      return map;
    };
    const machinesByJob = group(machines.rows, (r) => r.job_id, (r) => r.machine_id);
    const depsByJob = group(deps.rows, (r) => r.job_id, (r) => r.depends_on_id);

    return jobs.rows.map((r) => ({
      id: r.id,
      name: r.name,
      operationType: r.operation_type,
      duration: r.duration,
      releaseTime: r.release_time,
      deadline: r.deadline,
      priority: r.priority,
      eligibleMachines: machinesByJob.get(r.id) ?? [],
      dependencies: depsByJob.get(r.id) ?? [],
      inputData: r.input_data,
    }));
  }

  private translate(error: unknown, jobId: string): unknown {
    if (isUniqueViolation(error)) return new ConflictError(`Job ${jobId} already exists`);
    if (isForeignKeyViolation(error)) return new ConflictError('A referenced machine or job no longer exists');
    return error;
  }
}
