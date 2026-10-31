/** "14:03:22.457" from an ISO timestamp; an em dash when there is none. */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatDuration(ms: number | null): string {
  return ms === null ? '—' : `${ms} ms`;
}

/** A half-open slot interval, written as the brief does: "[2, 5)". */
export function formatSlots(start: number | null, end: number | null): string {
  return start === null || end === null ? '—' : `[${start}, ${end})`;
}
