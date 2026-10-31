import { assertTransition } from '../../domain/execution/lifecycle.ts';
import { ConflictError, NotFoundError } from '../../domain/model/errors.ts';
import type { Execution, ExecutionLog, ExecutionStatus, LogLevel } from '../../domain/model/execution.ts';
import type { JsonObject } from '../../domain/model/job.ts';
import type { ExecutionPatch, ExecutionRepository, LogEntry } from '../../application/ports/repositories.ts';
import type { Queryable } from './pool.ts';

interface ExecutionRow {
  id: number;
  schedule_id: number;
  job_id: string;
  status: ExecutionStatus;
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  output: JsonObject | null;
  error: string | null;
}

const COLUMNS = 'e.id, e.schedule_id, e.job_id, e.status, e.started_at, e.completed_at, e.duration_ms, e.output, e.error';

const toExecution = (r: ExecutionRow): Execution => ({
  id: r.id,
  scheduleId: r.schedule_id,
  jobId: r.job_id,
  status: r.status,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  durationMs: r.duration_ms,
  output: r.output,
  error: r.error,
});

export class PostgresExecutionRepository implements ExecutionRepository {
  constructor(private readonly q: Queryable) {}

  async listBySchedule(scheduleId: number): Promise<Execution[]> {
    const { rows } = await this.q.query<ExecutionRow>(
      `SELECT ${COLUMNS}
         FROM job_executions e
         JOIN schedule_assignments a ON a.schedule_id = e.schedule_id AND a.job_id = e.job_id
        WHERE e.schedule_id = $1
        ORDER BY a.start_slot, e.job_id COLLATE "C"`,
      [scheduleId],
    );
    return rows.map(toExecution);
  }

  async listAll(): Promise<Execution[]> {
    const { rows } = await this.q.query<ExecutionRow>(`SELECT ${COLUMNS} FROM job_executions e ORDER BY e.id DESC`);
    return rows.map(toExecution);
  }

  async findById(id: number): Promise<Execution | null> {
    const { rows } = await this.q.query<ExecutionRow>(`SELECT ${COLUMNS} FROM job_executions e WHERE e.id = $1`, [id]);
    return rows[0] ? toExecution(rows[0]) : null;
  }

  async transition(id: number, from: ExecutionStatus, to: ExecutionStatus, patch: ExecutionPatch = {}): Promise<Execution> {
    assertTransition(from, to);

    // Compare-and-set on the current status: if another writer got there first, this updates nothing.
    const { rows } = await this.q.query<ExecutionRow>(
      `UPDATE job_executions e
          SET status = $3,
              started_at = COALESCE($4, started_at),
              completed_at = COALESCE($5, completed_at),
              duration_ms = COALESCE($6, duration_ms),
              output = COALESCE($7::jsonb, output),
              error = COALESCE($8, error)
        WHERE e.id = $1 AND e.status = $2
        RETURNING ${COLUMNS}`,
      [
        id,
        from,
        to,
        patch.startedAt ?? null,
        patch.completedAt ?? null,
        patch.durationMs ?? null,
        patch.output === undefined ? null : JSON.stringify(patch.output),
        patch.error ?? null,
      ],
    );
    if (rows[0]) return toExecution(rows[0]);

    const current = await this.q.query<{ status: ExecutionStatus }>('SELECT status FROM job_executions WHERE id = $1', [id]);
    if (current.rows.length === 0) throw new NotFoundError(`Execution ${id} not found`);
    throw new ConflictError(`Execution ${id} is ${current.rows[0]!.status}, expected ${from}`);
  }

  async addLog(executionId: number, entry: LogEntry): Promise<void> {
    await this.q.query('INSERT INTO execution_logs (execution_id, ts, level, message) VALUES ($1, $2, $3, $4)', [
      executionId,
      entry.ts,
      entry.level,
      entry.message,
    ]);
  }

  async logs(executionId: number): Promise<ExecutionLog[]> {
    const { rows } = await this.q.query<{ id: number; execution_id: number; ts: Date; level: LogLevel; message: string }>(
      'SELECT id, execution_id, ts, level, message FROM execution_logs WHERE execution_id = $1 ORDER BY id',
      [executionId],
    );
    return rows.map((r) => ({ id: r.id, executionId: r.execution_id, ts: r.ts, level: r.level, message: r.message }));
  }
}
