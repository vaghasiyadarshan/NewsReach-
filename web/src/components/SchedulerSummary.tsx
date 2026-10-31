import type { SchedulerSummaryDto } from '../api/types.ts';
import { formatTimestamp } from '../format.ts';

const SCHEDULE_STATUS: Record<SchedulerSummaryDto['status'], string> = {
  GENERATED: 'Generated, not run',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  COMPLETED_WITH_FAILURES: 'Completed with failures',
};

export function SchedulerSummary({ schedule }: { schedule: SchedulerSummaryDto | null }) {
  if (!schedule) {
    return (
      <section className="card" aria-label="Scheduler summary">
        <h2>Scheduler summary</h2>
        <p className="empty">No schedule yet. Click “Generate Schedule” to compute the optimal plan.</p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Scheduler summary">
      <h2>
        Scheduler summary <span className="muted">· schedule #{schedule.id}, generated {formatTimestamp(schedule.createdAt)}</span>
      </h2>

      <div className="summary-grid">
        <div className="stat">
          <div className="label">Total priority score</div>
          <div className="value" data-testid="total-priority">{schedule.totalPriority}</div>
        </div>
        <div className="stat">
          <div className="label">Scheduled jobs</div>
          <div className="value" data-testid="scheduled-count">{schedule.scheduledCount}</div>
        </div>
        <div className="stat">
          <div className="label">Makespan (slots)</div>
          <div className="value" data-testid="makespan">{schedule.makespan}</div>
        </div>
        <div className="stat">
          <div className="label">Schedule status</div>
          <div className="value" style={{ fontSize: 16, paddingTop: 6 }} data-testid="schedule-status">
            {SCHEDULE_STATUS[schedule.status]}
          </div>
        </div>
      </div>

      <h2>Excluded jobs</h2>
      {schedule.exclusions.length === 0 ? (
        <p className="empty">No jobs were excluded.</p>
      ) : (
        <ul className="exclusions" data-testid="exclusions">
          {schedule.exclusions.map((e) => (
            <li key={e.jobId}>
              <strong>{e.jobId}</strong> <span className="muted">({e.code.replaceAll('_', ' ').toLowerCase()})</span>
              <div>{e.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
