import type { MachineLoadDto } from '../api/types.ts';
import { formatSlots } from '../format.ts';
import { statusClass, statusGlyph, statusLabel } from './StatusBadge.tsx';

function Timeline({ machine, horizon }: { machine: MachineLoadDto; horizon: number }) {
  const slots = Array.from({ length: horizon }, (_, i) => i);
  return (
    <div style={{ ['--slots' as string]: horizon }}>
      <div className="timeline" role="img" aria-label={`${machine.name} timeline over slots 0 to ${horizon}`}>
        {machine.jobs.map((job) => (
          <div
            key={job.jobId}
            className={`block ${statusClass(job.status)}`}
            style={{ gridColumn: `${job.start + 1} / ${job.end + 1}` }}
            title={`${job.jobId} ${job.jobName}, slots ${formatSlots(job.start, job.end)}, ${statusLabel(job.status)}`}
            data-testid={`block-${job.jobId}`}
          >
            <span className="glyph" aria-hidden="true">
              {statusGlyph(job.status)}
            </span>
            {job.jobId}
          </div>
        ))}
      </div>
      <div className="axis" aria-hidden="true">
        {slots.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}

export function MachinesPanel({ machines, horizon }: { machines: MachineLoadDto[]; horizon: number }) {
  return (
    <section className="card" aria-label="Machines">
      <h2>Machines</h2>
      {machines.map((machine) => (
        <div className="machine" key={machine.id} data-testid={`machine-${machine.id}`}>
          <div className="machine-head">
            <span className="name">{machine.name}</span>
            <span className="muted">{machine.id}</span>
            <span className={`badge ${machine.status === 'AVAILABLE' ? 'status-completed' : 'status-failed'}`}>
              <span className="glyph" aria-hidden="true">
                {machine.status === 'AVAILABLE' ? '●' : '✕'}
              </span>
              {machine.status === 'AVAILABLE' ? 'Available' : 'Unavailable'}
            </span>
            <span className="workload" data-testid={`workload-${machine.id}`}>
              Workload: {machine.busySlots} of {horizon} slots · {machine.workloadPercent}%
            </span>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${machine.workloadPercent}%` }} />
            </div>
          </div>

          <Timeline machine={machine} horizon={horizon} />

          <p className="subtle" style={{ marginTop: 8 }}>
            Assigned jobs:{' '}
            {machine.jobs.length === 0
              ? 'none'
              : machine.jobs.map((j) => `${j.jobId} ${formatSlots(j.start, j.end)}`).join(', ')}
          </p>
        </div>
      ))}
    </section>
  );
}
