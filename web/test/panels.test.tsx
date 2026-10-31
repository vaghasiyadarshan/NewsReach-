import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobRowDto, MachineLoadDto } from '../src/api/types.ts';
import { ExecutionTable } from '../src/components/ExecutionTable.tsx';
import { MachinesPanel } from '../src/components/MachinesPanel.tsx';

afterEach(cleanup);

const machine = (overrides: Partial<MachineLoadDto> = {}): MachineLoadDto => ({
  id: 'M1',
  name: 'Processing Machine 1',
  status: 'AVAILABLE',
  jobs: [],
  busySlots: 0,
  horizon: 12,
  workloadPercent: 0,
  ...overrides,
});

const row = (overrides: Partial<JobRowDto> = {}): JobRowDto => ({
  id: 'J1',
  name: 'Validate article',
  operationType: 'VALIDATE_ARTICLE',
  priority: 10,
  status: 'SCHEDULED',
  machineId: 'M2',
  scheduledStart: 0,
  scheduledEnd: 2,
  startedAt: null,
  completedAt: null,
  durationMs: null,
  output: null,
  error: null,
  exclusionReason: null,
  ...overrides,
});

describe('MachinesPanel', () => {
  it('places each job by start slot and width by duration on a 12-slot timeline', () => {
    render(
      <MachinesPanel
        horizon={12}
        machines={[
          machine({
            busySlots: 5,
            workloadPercent: 42,
            jobs: [
              { jobId: 'J2', jobName: 'Count words', start: 0, end: 2, status: 'COMPLETED' },
              { jobId: 'J5', jobName: 'Build report', start: 4, end: 6, status: 'FAILED' },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('block-J2').style.gridColumn).toBe('1 / 3'); // slots 0 and 1
    expect(screen.getByTestId('block-J5').style.gridColumn).toBe('5 / 7'); // slots 4 and 5
    expect(screen.getByTestId('block-J2').className).toContain('status-completed');
    expect(screen.getByTestId('block-J5').className).toContain('status-failed');
  });

  it('labels block status with text in the tooltip and a glyph, not colour alone', () => {
    render(
      <MachinesPanel
        horizon={12}
        machines={[machine({ jobs: [{ jobId: 'J3', jobName: 'Generate summary', start: 2, end: 4, status: 'BLOCKED' }] })]}
      />,
    );
    const block = screen.getByTestId('block-J3');
    expect(block.title).toBe('J3 Generate summary, slots [2, 4), Blocked');
    expect(block.textContent).toContain('⊘');
  });

  it('shows workload, assigned jobs and the axis for 12 slots', () => {
    render(
      <MachinesPanel
        horizon={12}
        machines={[
          machine({ busySlots: 5, workloadPercent: 42, jobs: [{ jobId: 'J2', jobName: 'x', start: 0, end: 2, status: 'SCHEDULED' }] }),
        ]}
      />,
    );
    expect(screen.getByTestId('workload-M1').textContent).toBe('Workload: 5 of 12 slots · 42%');
    expect(screen.getByText(/Assigned jobs: J2 \[0, 2\)/)).toBeTruthy();
    const axis = document.querySelector('.axis')!;
    expect(axis.children).toHaveLength(12);
  });

  it('shows an idle machine with an empty timeline', () => {
    render(<MachinesPanel horizon={12} machines={[machine()]} />);
    expect(screen.getByText('Assigned jobs: none')).toBeTruthy();
    expect(screen.getByTestId('workload-M1').textContent).toContain('0 of 12 slots · 0%');
    expect(document.querySelectorAll('.block')).toHaveLength(0);
  });

  it('shows machine status in words', () => {
    render(<MachinesPanel horizon={12} machines={[machine({ status: 'UNAVAILABLE' })]} />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });
});

describe('ExecutionTable', () => {
  it('shows the failed job error and the blocked job reason, with no actual times for the blocked one', () => {
    render(
      <ExecutionTable
        jobs={[
          row({ id: 'J1', status: 'FAILED', error: 'Missing or empty field: title', startedAt: '2026-01-01T10:00:00.100Z', completedAt: '2026-01-01T10:00:00.130Z', durationMs: 30 }),
          row({ id: 'J3', name: 'Generate summary', operationType: 'GENERATE_SUMMARY', status: 'BLOCKED', error: 'Blocked: dependency J1 FAILED', scheduledStart: 2, scheduledEnd: 4 }),
        ]}
      />,
    );
    const failed = within(screen.getByTestId('row-J1'));
    expect(failed.getByText('Failed')).toBeTruthy();
    expect(failed.getByText('Missing or empty field: title')).toBeTruthy();
    expect(failed.getByText('30 ms')).toBeTruthy();

    const blocked = within(screen.getByTestId('row-J3'));
    expect(blocked.getByText('Blocked')).toBeTruthy();
    expect(blocked.getByText('Blocked: dependency J1 FAILED')).toBeTruthy();
    expect(blocked.getByText('[2, 4)')).toBeTruthy();
    expect(blocked.getAllByText('—').length).toBeGreaterThanOrEqual(3); // started, finished, duration
  });

  it('shows job name, operation, machine and scheduled slots', () => {
    render(<ExecutionTable jobs={[row()]} />);
    const r = within(screen.getByTestId('row-J1'));
    expect(r.getByText('Validate article', { exact: false })).toBeTruthy();
    expect(r.getByText('VALIDATE_ARTICLE')).toBeTruthy();
    expect(r.getByText('M2')).toBeTruthy();
    expect(r.getByText('[0, 2)')).toBeTruthy();
    expect(r.getByText('Scheduled')).toBeTruthy();
  });

  it('offers completed output behind an expander', () => {
    render(<ExecutionTable jobs={[row({ id: 'J2', status: 'COMPLETED', output: { wordCount: 42 } })]} />);
    const r = within(screen.getByTestId('row-J2'));
    expect(r.getByText('View output')).toBeTruthy();
    expect(document.querySelector('pre.json')!.textContent).toContain('"wordCount": 42');
  });

  it('explains an excluded job', () => {
    render(
      <ExecutionTable
        jobs={[row({ id: 'J7', status: 'UNSCHEDULED', machineId: null, scheduledStart: null, scheduledEnd: null, exclusionReason: 'Earliest possible finish is slot 10, but it must finish by its deadline, slot 8.' })]}
      />,
    );
    const r = within(screen.getByTestId('row-J7'));
    expect(r.getByText('Unscheduled')).toBeTruthy();
    expect(r.getByText(/Excluded: Earliest possible finish is slot 10/)).toBeTruthy();
  });

  it('shows an empty state without jobs', () => {
    render(<ExecutionTable jobs={[]} />);
    expect(screen.getByText('There are no jobs yet.')).toBeTruthy();
  });
});
