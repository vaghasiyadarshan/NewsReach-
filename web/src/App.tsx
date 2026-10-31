import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api/client.ts';
import type { Dashboard, RunResultDto } from './api/types.ts';
import { ActionBar, type Action } from './components/ActionBar.tsx';
import { ExecutionTable } from './components/ExecutionTable.tsx';
import { MachinesPanel } from './components/MachinesPanel.tsx';
import { OverviewTiles } from './components/OverviewTiles.tsx';
import { SchedulerSummary } from './components/SchedulerSummary.tsx';

const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong';

function describeRun(run: RunResultDto): string {
  const parts = [
    run.completed.length && `${run.completed.length} completed`,
    run.failed.length && `${run.failed.length} failed`,
    run.blocked.length && `${run.blocked.length} blocked`,
  ].filter(Boolean);
  return parts.length > 0
    ? `Run finished: ${parts.join(', ')}.`
    : `Nothing to run: all ${run.skipped.length} jobs had already finished, so none were executed again.`;
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  const load = useCallback(async () => {
    try {
      setDashboard(await api.dashboard());
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs an action, shows its outcome, then refreshes the page state whether it worked or not. */
  async function perform(action: Action, work: () => Promise<string>) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (e) {
      setError(messageOf(e));
    } finally {
      await load();
      setBusy(null);
    }
  }

  const schedule = dashboard?.schedule ?? null;
  const stale = schedule?.stale ?? false;
  const runHint = !schedule
    ? 'Generate a schedule first'
    : stale
      ? 'The schedule is stale: generate a new one first'
      : null;

  return (
    <main>
      <div className="header">
        <div>
          <h1>NewsReach Scheduler</h1>
          <p className="subtle">Plan, run and monitor content jobs across machines</p>
        </div>
        <ActionBar
          busy={busy}
          canRun={runHint === null}
          runHint={runHint}
          onGenerate={() => perform('generate', async () => {
            const s = await api.generateSchedule();
            return `Schedule #${s.id} generated: ${s.scheduledCount} jobs scheduled, priority ${s.totalPriority}, makespan ${s.makespan}.`;
          })}
          onRun={() => perform('run', async () => describeRun(await api.runSchedule()))}
          onReset={() => {
            if (!window.confirm('Replace all jobs, schedules and executions with the sample data?')) return;
            void perform('reset', async () => {
              const r = await api.resetSample();
              return `Sample data loaded: ${r.machines} machines, ${r.jobs} jobs.`;
            });
          }}
        />
      </div>

      {error && (
        <div className="banner error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}
      {notice && (
        <div className="banner notice" role="status">
          {notice}
        </div>
      )}
      {stale && (
        <div className="banner warning" role="alert">
          <strong>This schedule is stale.</strong> Jobs or machines changed after it was generated. Generate a new schedule before running.
        </div>
      )}

      {dashboard ? (
        <>
          <OverviewTiles overview={dashboard.overview} />
          <SchedulerSummary schedule={schedule} />
          <MachinesPanel machines={dashboard.machines} horizon={dashboard.horizon} />
          <ExecutionTable jobs={dashboard.jobs} />
        </>
      ) : (
        !error && <p className="empty">Loading…</p>
      )}
    </main>
  );
}
