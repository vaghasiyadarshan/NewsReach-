import type { Assignment, Exclusion, ExclusionCode, Schedule, ScheduleInputSnapshot } from '../../domain/models/schedule.ts';
import type { NewSchedule, ScheduleRepository } from '../../application/port/repositories.ts';
import type { Queryable } from '../orm/pool.ts';

interface ScheduleRow {
  id: number;
  created_at: Date;
  total_priority: number;
  scheduled_count: number;
  makespan: number;
  input_fingerprint: string;
  input_snapshot: ScheduleInputSnapshot;
  solver_stats: Record<string, unknown>;
}

const COLUMNS =
  'id, created_at, total_priority, scheduled_count, makespan, input_fingerprint, input_snapshot, solver_stats';

export class PostgresScheduleRepository implements ScheduleRepository {
  constructor(private readonly q: Queryable) {}

  async create(draft: NewSchedule): Promise<Schedule> {
    const { result } = draft;
    const inserted = await this.q.query<{ id: number }>(
      `INSERT INTO schedules (created_at, total_priority, scheduled_count, makespan, input_fingerprint, input_snapshot, solver_stats)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) RETURNING id`,
      [
        draft.createdAt,
        result.totalPriority,
        result.scheduledCount,
        result.makespan,
        draft.fingerprint,
        JSON.stringify(draft.snapshot),
        JSON.stringify(draft.solverStats),
      ],
    );
    const id = inserted.rows[0]!.id;

    const a = result.assignments;
    if (a.length > 0) {
      await this.q.query(
        `INSERT INTO schedule_assignments (schedule_id, job_id, machine_id, start_slot, end_slot)
         SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::int[])`,
        [id, a.map((x) => x.jobId), a.map((x) => x.machineId), a.map((x) => x.start), a.map((x) => x.end)],
      );
      await this.q.query(
        `INSERT INTO job_executions (schedule_id, job_id, status)
         SELECT $1, unnest($2::text[]), 'SCHEDULED'`,
        [id, a.map((x) => x.jobId)],
      );
    }

    const e = result.exclusions;
    if (e.length > 0) {
      await this.q.query(
        `INSERT INTO schedule_exclusions (schedule_id, job_id, reason_code, reason_text)
         SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[])`,
        [id, e.map((x) => x.jobId), e.map((x) => x.code), e.map((x) => x.reason)],
      );
    }

    return {
      id,
      createdAt: draft.createdAt,
      fingerprint: draft.fingerprint,
      snapshot: draft.snapshot,
      solverStats: draft.solverStats,
      ...result,
    };
  }

  async findLatest(): Promise<Schedule | null> {
    const { rows } = await this.q.query<ScheduleRow>(`SELECT ${COLUMNS} FROM schedules ORDER BY id DESC LIMIT 1`);
    return rows[0] ? this.buildScheduleWithDetails(rows[0]) : null;
  }

  async findById(id: number): Promise<Schedule | null> {
    const { rows } = await this.q.query<ScheduleRow>(`SELECT ${COLUMNS} FROM schedules WHERE id = $1`, [id]);
    return rows[0] ? this.buildScheduleWithDetails(rows[0]) : null;
  }

  private async buildScheduleWithDetails(row: ScheduleRow): Promise<Schedule> {
    const assignments = await this.q.query<{ job_id: string; machine_id: string; start_slot: number; end_slot: number }>(
      `SELECT job_id, machine_id, start_slot, end_slot FROM schedule_assignments
        WHERE schedule_id = $1 ORDER BY job_id COLLATE "C"`,
      [row.id],
    );
    const exclusions = await this.q.query<{ job_id: string; reason_code: ExclusionCode; reason_text: string }>(
      `SELECT job_id, reason_code, reason_text FROM schedule_exclusions
        WHERE schedule_id = $1 ORDER BY job_id COLLATE "C"`,
      [row.id],
    );

    return {
      id: row.id,
      createdAt: row.created_at,
      totalPriority: row.total_priority,
      scheduledCount: row.scheduled_count,
      makespan: row.makespan,
      fingerprint: row.input_fingerprint,
      snapshot: row.input_snapshot,
      solverStats: row.solver_stats,
      assignments: assignments.rows.map((r): Assignment => ({
        jobId: r.job_id,
        machineId: r.machine_id,
        start: r.start_slot,
        end: r.end_slot,
      })),
      exclusions: exclusions.rows.map((r): Exclusion => ({ jobId: r.job_id, code: r.reason_code, reason: r.reason_text })),
    };
  }
}
