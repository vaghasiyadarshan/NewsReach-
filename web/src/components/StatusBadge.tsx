import type { JobStatus } from '../api/types.ts';

// Each status has a glyph and a label as well as a colour, so meaning never rests on colour alone.
const STATUS: Record<JobStatus, { glyph: string; label: string }> = {
  COMPLETED: { glyph: '✓', label: 'Completed' },
  FAILED: { glyph: '✕', label: 'Failed' },
  BLOCKED: { glyph: '⊘', label: 'Blocked' },
  RUNNING: { glyph: '▶', label: 'Running' },
  SCHEDULED: { glyph: '◷', label: 'Scheduled' },
  PENDING: { glyph: '–', label: 'Pending' },
  UNSCHEDULED: { glyph: '–', label: 'Unscheduled' },
};

export const statusClass = (status: JobStatus): string => `status-${status.toLowerCase()}`;
export const statusGlyph = (status: JobStatus): string => STATUS[status].glyph;
export const statusLabel = (status: JobStatus): string => STATUS[status].label;

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      <span className="glyph" aria-hidden="true">
        {statusGlyph(status)}
      </span>
      {statusLabel(status)}
    </span>
  );
}
