import type { JobRowDto } from '../api/types.ts';
import { formatDuration, formatSlots, formatTimestamp } from '../format.ts';
import { StatusBadge } from './StatusBadge.tsx';

function Result({ row }: { row: JobRowDto }) {
  if (row.status === 'FAILED') return <div className="error-text">{row.error}</div>;
  if (row.status === 'BLOCKED') return <div className="blocked-text">{row.error}</div>;
  if (row.status === 'UNSCHEDULED') return <div className="muted">Excluded: {row.exclusionReason}</div>;
  if (row.output) {
    return (
      <details>
        <summary>View output</summary>
        <pre className="json">{JSON.stringify(row.output, null, 2)}</pre>
      </details>
    );
  }
  return <span className="muted">—</span>;
}

export function ExecutionTable({ jobs }: { jobs: JobRowDto[] }) {
  return (
    <section className="card" aria-label="Execution details">
      <h2>Execution details</h2>
      {jobs.length === 0 ? (
        <p className="empty">There are no jobs yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Operation</th>
                <th>Status</th>
                <th>Machine</th>
                <th className="num">Scheduled</th>
                <th className="num">Started</th>
                <th className="num">Finished</th>
                <th className="num">Duration</th>
                <th>Output / error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((row) => (
                <tr key={row.id} data-testid={`row-${row.id}`}>
                  <td>
                    <strong>{row.id}</strong> {row.name}
                  </td>
                  <td>{row.operationType}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{row.machineId ?? '—'}</td>
                  <td className="num">{formatSlots(row.scheduledStart, row.scheduledEnd)}</td>
                  <td className="num">{formatTimestamp(row.startedAt)}</td>
                  <td className="num">{formatTimestamp(row.completedAt)}</td>
                  <td className="num">{formatDuration(row.durationMs)}</td>
                  <td>
                    <Result row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
