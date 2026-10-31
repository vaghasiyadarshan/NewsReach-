import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { apiError, emptyDashboard, installFakeApi, summary } from './fake-api.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tile = (name: string) => within(screen.getByTestId(`tile-${name}`)).getByText(/^\d+$/).textContent;

describe('dashboard summary and counts', () => {
  it('shows the job overview and the scheduler summary from the API', async () => {
    installFakeApi({
      'GET /api/dashboard': () => ({
        json: emptyDashboard({
          overview: { total: 7, scheduled: 0, running: 0, completed: 4, failed: 1, blocked: 1, unscheduled: 1 },
          schedule: summary({
            status: 'COMPLETED_WITH_FAILURES',
            exclusions: [{ jobId: 'J7', code: 'WINDOW_TOO_SMALL', reason: 'Earliest possible finish is slot 10.' }],
          }),
        }),
      }),
    });
    render(<App />);

    await screen.findByTestId('total-priority');
    expect(tile('total')).toBe('7');
    expect(tile('completed')).toBe('4');
    expect(tile('failed')).toBe('1');
    expect(tile('blocked')).toBe('1');
    expect(tile('unscheduled')).toBe('1');
    expect(screen.getByTestId('total-priority').textContent).toBe('45');
    expect(screen.getByTestId('scheduled-count').textContent).toBe('6');
    expect(screen.getByTestId('makespan').textContent).toBe('7');
    expect(screen.getByTestId('schedule-status').textContent).toBe('Completed with failures');
    expect(within(screen.getByTestId('exclusions')).getByText(/Earliest possible finish is slot 10/)).toBeTruthy();
  });

  it('shows an empty state and disables Run before any schedule exists', async () => {
    installFakeApi({ 'GET /api/dashboard': () => ({ json: emptyDashboard() }) });
    render(<App />);

    await screen.findByText(/No schedule yet/);
    const run = screen.getByRole('button', { name: 'Run Schedule' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.title).toBe('Generate a schedule first');
    expect((screen.getByRole('button', { name: 'Generate Schedule' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('warns about a stale schedule and disables Run', async () => {
    installFakeApi({ 'GET /api/dashboard': () => ({ json: emptyDashboard({ schedule: summary({ stale: true }) }) }) });
    render(<App />);

    expect((await screen.findByText(/This schedule is stale/)).closest('[role=alert]')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run Schedule' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('actions refresh the page state', () => {
  it('Generate Schedule posts, reports the result and reloads the dashboard', async () => {
    let generated = false;
    const calls = installFakeApi({
      'GET /api/dashboard': () => ({
        json: generated
          ? emptyDashboard({ overview: { total: 6, scheduled: 6, running: 0, completed: 0, failed: 0, blocked: 0, unscheduled: 0 }, schedule: summary() })
          : emptyDashboard(),
      }),
      'POST /api/schedules/generate': () => {
        generated = true;
        return { status: 201, json: { id: 1, scheduledCount: 6, totalPriority: 45, makespan: 7 } };
      },
    });
    render(<App />);
    await screen.findByText(/No schedule yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Generate Schedule' }));

    expect(await screen.findByText(/Schedule #1 generated: 6 jobs scheduled, priority 45, makespan 7/)).toBeTruthy();
    await waitFor(() => expect(tile('scheduled')).toBe('6'));
    expect(screen.getByTestId('total-priority').textContent).toBe('45');
    expect(calls).toEqual(['GET /api/dashboard', 'POST /api/schedules/generate', 'GET /api/dashboard']);
    expect((screen.getByRole('button', { name: 'Run Schedule' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Run Schedule reports what ran and reloads; running again reports nothing was re-executed', async () => {
    let runs = 0;
    const calls = installFakeApi({
      'GET /api/dashboard': () => ({
        json: emptyDashboard({
          overview: { total: 6, scheduled: runs === 0 ? 6 : 0, running: 0, completed: runs === 0 ? 0 : 5, failed: runs === 0 ? 0 : 1, blocked: 0, unscheduled: 0 },
          schedule: summary(),
        }),
      }),
      'POST /api/schedules/run': () => {
        runs++;
        return {
          json:
            runs === 1
              ? { completed: ['J1', 'J2', 'J3', 'J4', 'J5'], failed: ['J6'], blocked: [], skipped: [] }
              : { completed: [], failed: [], blocked: [], skipped: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] },
        };
      },
    });
    render(<App />);
    await screen.findByTestId('total-priority');
    expect(tile('scheduled')).toBe('6');

    await userEvent.click(screen.getByRole('button', { name: 'Run Schedule' }));
    expect(await screen.findByText('Run finished: 5 completed, 1 failed.')).toBeTruthy();
    await waitFor(() => expect(tile('completed')).toBe('5'));
    expect(tile('failed')).toBe('1');
    expect(tile('scheduled')).toBe('0');

    await userEvent.click(screen.getByRole('button', { name: 'Run Schedule' }));
    expect(await screen.findByText(/Nothing to run: all 6 jobs had already finished/)).toBeTruthy();
    expect(calls.filter((c) => c === 'POST /api/schedules/run')).toHaveLength(2);
  });

  it('shows the API error message, and still refreshes', async () => {
    const calls = installFakeApi({
      'GET /api/dashboard': () => ({ json: emptyDashboard() }),
      'POST /api/schedules/generate': () =>
        apiError(422, 'LIMIT_EXCEEDED', 'Too many jobs: 9 (the scheduler supports at most 8).'),
    });
    render(<App />);
    await screen.findByText(/No schedule yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Generate Schedule' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Too many jobs: 9 (the scheduler supports at most 8).');
    expect(calls.filter((c) => c === 'GET /api/dashboard')).toHaveLength(2);
    expect((screen.getByRole('button', { name: 'Generate Schedule' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the stale conflict from the server when running a stale schedule', async () => {
    installFakeApi({
      'GET /api/dashboard': () => ({ json: emptyDashboard({ schedule: summary() }) }),
      'POST /api/schedules/run': () => apiError(409, 'CONFLICT', 'The schedule is stale: generate a new schedule first.'),
    });
    render(<App />);
    await screen.findByTestId('total-priority');

    await userEvent.click(screen.getByRole('button', { name: 'Run Schedule' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The schedule is stale');
  });

  it('Reset Sample Data asks first and does nothing when declined', async () => {
    const calls = installFakeApi({ 'GET /api/dashboard': () => ({ json: emptyDashboard() }) });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByText(/No schedule yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Reset Sample Data' }));
    expect(calls).toEqual(['GET /api/dashboard']);
  });

  it('Reset Sample Data posts and reloads when confirmed', async () => {
    const calls = installFakeApi({
      'GET /api/dashboard': () => ({ json: emptyDashboard() }),
      'POST /api/dev/reset-sample': () => ({ json: { machines: 2, jobs: 6 } }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText(/No schedule yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Reset Sample Data' }));
    expect(await screen.findByText('Sample data loaded: 2 machines, 6 jobs.')).toBeTruthy();
    expect(calls).toEqual(['GET /api/dashboard', 'POST /api/dev/reset-sample', 'GET /api/dashboard']);
  });

  it('reports an unreachable API instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot reach the API');
  });
});
