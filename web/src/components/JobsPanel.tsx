import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import type { JobDto, MachineDto } from '../api/types.ts';
import { JobForm } from './JobForm.tsx';
import { StatusBadge } from './StatusBadge.tsx';

interface Props {
  machines: MachineDto[];
  /** Changes whenever the dashboard reloads, so this list reloads with it. */
  refreshToken: unknown;
  /** Called after a job is saved, with a message to show. */
  onSaved: (message: string) => void;
}

type FormState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; job: JobDto };

export function JobsPanel({ machines, refreshToken, onSaved }: Props) {
  const [jobs, setJobs] = useState<JobDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });

  const reload = useCallback(async () => {
    try {
      setJobs(await api.listJobs());
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  async function handleSaved(job: JobDto, mode: 'created' | 'updated') {
    setForm({ mode: 'closed' });
    await reload();
    onSaved(`Job ${job.id} ${mode}. Generate a new schedule to include the change.`);
  }

  return (
    <section className="card" aria-label="Jobs">
      <div className="jobs-head">
        <h2>Jobs</h2>
        {form.mode === 'closed' && (
          <button className="primary" onClick={() => setForm({ mode: 'add' })}>
            Add job
          </button>
        )}
      </div>

      {form.mode !== 'closed' && (
        <JobForm
          key={form.mode === 'edit' ? form.job.id : 'new'}
          machines={machines}
          jobs={jobs ?? []}
          editing={form.mode === 'edit' ? form.job : null}
          onCancel={() => setForm({ mode: 'closed' })}
          onSaved={(job, mode) => void handleSaved(job, mode)}
        />
      )}

      {loadError && (
        <div className="banner error" role="alert">
          Could not load jobs: {loadError}
        </div>
      )}

      {jobs && jobs.length === 0 && <p className="empty">There are no jobs yet. Add one, or load the sample data.</p>}

      {jobs && jobs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Operation</th>
                <th className="num">Priority</th>
                <th className="num">Duration</th>
                <th className="num">Window</th>
                <th>Machines</th>
                <th>Depends on</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} data-testid={`job-${job.id}`}>
                  <td>
                    <strong>{job.id}</strong> {job.name}
                  </td>
                  <td>{job.operationType}</td>
                  <td className="num">{job.priority}</td>
                  <td className="num">{job.duration}</td>
                  <td className="num">
                    {job.releaseTime} to {job.deadline}
                  </td>
                  <td>{job.eligibleMachines.join(', ')}</td>
                  <td>{job.dependencies.length > 0 ? job.dependencies.join(', ') : '—'}</td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td>
                    <button aria-label={`Edit ${job.id}`} onClick={() => setForm({ mode: 'edit', job })}>
                      Edit
                    </button>
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
