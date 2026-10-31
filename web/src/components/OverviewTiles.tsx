import type { Dashboard, JobStatus } from '../api/types.ts';
import { statusClass, statusGlyph } from './StatusBadge.tsx';

type Overview = Dashboard['overview'];

// Tile status uses the same glyph and colour as the badges; `total` has none.
const TILES: Array<{ key: keyof Overview; label: string; status?: JobStatus }> = [
  { key: 'total', label: 'Total jobs' },
  { key: 'scheduled', label: 'Scheduled', status: 'SCHEDULED' },
  { key: 'completed', label: 'Completed', status: 'COMPLETED' },
  { key: 'failed', label: 'Failed', status: 'FAILED' },
  { key: 'blocked', label: 'Blocked', status: 'BLOCKED' },
  { key: 'unscheduled', label: 'Unscheduled', status: 'UNSCHEDULED' },
];

export function OverviewTiles({ overview }: { overview: Overview }) {
  return (
    <section aria-label="Job overview">
      <div className="tiles">
        {TILES.map(({ key, label, status }) => (
          <div className={`tile ${status ? statusClass(status) : ''}`} key={key} data-testid={`tile-${key}`}>
            <div className="label">
              {status && (
                <span className="glyph" aria-hidden="true" style={{ color: 'var(--status)', fontWeight: 800 }}>
                  {statusGlyph(status)}
                </span>
              )}
              {label}
            </div>
            <div className="value">{overview[key]}</div>
          </div>
        ))}
        {overview.running > 0 && (
          <div className="tile status-running" data-testid="tile-running">
            <div className="label">Running</div>
            <div className="value">{overview.running}</div>
          </div>
        )}
      </div>
    </section>
  );
}
