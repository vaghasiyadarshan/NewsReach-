import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobDto, MachineDto } from '../src/api/types.ts';
import { JobsPanel } from '../src/components/JobsPanel.tsx';
import { apiError, installFakeApi } from './fake-api.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const machines: MachineDto[] = [
  { id: 'M1', name: 'Processing Machine 1', status: 'AVAILABLE' },
  { id: 'M2', name: 'Processing Machine 2', status: 'AVAILABLE' },
];

const job = (id: string, overrides: Partial<JobDto> = {}): JobDto => ({
  id,
  name: `Job ${id}`,
  operationType: 'COUNT_WORDS',
  duration: 2,
  releaseTime: 0,
  deadline: 8,
  priority: 5,
  eligibleMachines: ['M1'],
  dependencies: [],
  inputData: { body: 'one two' },
  status: 'PENDING',
  ...overrides,
});

const submitButton = () => document.querySelector('button[type=submit]') as HTMLButtonElement;

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;

async function fill(label: RegExp | string, value: string) {
  const el = field(label);
  await userEvent.clear(el);
  if (value) await userEvent.type(el, value);
}

describe('JobsPanel list', () => {
  it('lists jobs with their window, machines, dependencies and status', async () => {
    installFakeApi({
      'GET /api/jobs': () => ({
        json: [job('J1'), job('J3', { dependencies: ['J1'], eligibleMachines: ['M1', 'M2'], releaseTime: 2, deadline: 8, priority: 9, status: 'SCHEDULED' })],
      }),
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);

    const row = within(await screen.findByTestId('job-J3'));
    expect(row.getByText('2 to 8')).toBeTruthy();
    expect(row.getByText('M1, M2')).toBeTruthy();
    expect(row.getByText('J1')).toBeTruthy();
    expect(row.getByText('Scheduled')).toBeTruthy();
  });

  it('shows an empty state when there are no jobs', async () => {
    installFakeApi({});
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    expect(await screen.findByText(/There are no jobs yet/)).toBeTruthy();
  });

  it('reports a failure to load the list', async () => {
    installFakeApi({ 'GET /api/jobs': () => apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred') });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    expect((await screen.findByRole('alert')).textContent).toContain('An unexpected error occurred');
  });

  it('reloads when the dashboard reloads', async () => {
    const calls = installFakeApi({});
    const { rerender } = render(<JobsPanel machines={machines} refreshToken={1} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    rerender(<JobsPanel machines={machines} refreshToken={2} onSaved={() => {}} />);
    await waitFor(() => expect(calls.filter((c) => c === 'GET /api/jobs')).toHaveLength(2));
  });
});

describe('adding a job', () => {
  it('sends the entered values to POST /api/jobs, closes the form and reports it', async () => {
    let sent: unknown;
    const onSaved = vi.fn();
    const calls = installFakeApi({
      'POST /api/jobs': (body) => {
        sent = JSON.parse(body as string);
        return { status: 201, json: { ...job('J7'), status: 'PENDING' } };
      },
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={onSaved} />);
    await screen.findByText(/There are no jobs yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    await fill('Job ID', 'J7');
    await fill('Name', 'Count words');
    await fill(/Priority/, '7');
    await fill('Duration (slots)', '2');
    await fill('Release time', '1');
    await fill('Deadline', '9');
    await userEvent.click(screen.getByLabelText(/M1/));
    await userEvent.click(screen.getByLabelText(/M2/));
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual({
      id: 'J7',
      name: 'Count words',
      operationType: 'COUNT_WORDS',
      duration: 2,
      releaseTime: 1,
      deadline: 9,
      priority: 7,
      eligibleMachines: ['M1', 'M2'],
      dependencies: [],
      inputData: { body: 'Article body text' },
    });
    expect(onSaved.mock.calls[0]![0]).toBe('Job J7 created. Generate a new schedule to include the change.');
    expect(calls.filter((c) => c === 'GET /api/jobs')).toHaveLength(2); // initial load, reload after save
    expect(screen.queryByRole('form', { name: 'Add job' })).toBeNull(); // form closed
  });

  it('offers other jobs as dependencies and sends the chosen ones', async () => {
    let sent: { dependencies?: string[] } = {};
    installFakeApi({
      'GET /api/jobs': () => ({ json: [job('J1'), job('J2')] }),
      'POST /api/jobs': (body) => {
        sent = JSON.parse(body as string);
        return { status: 201, json: job('J3') };
      },
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByTestId('job-J1');

    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    await fill('Job ID', 'J3');
    await fill('Name', 'Third');
    await userEvent.click(within(screen.getByRole('group', { name: /Eligible machines/ })).getByLabelText(/M1/));
    await userEvent.click(within(screen.getByRole('group', { name: /Dependencies/ })).getByLabelText(/J2/));
    await userEvent.click(submitButton());

    await waitFor(() => expect(sent.dependencies).toEqual(['J2']));
  });

  it('shows each field error returned by the server next to its field', async () => {
    installFakeApi({
      'POST /api/jobs': () => ({
        status: 400,
        json: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: {
              issues: [
                { field: 'priority', message: 'must be an integer between 1 and 10' },
                { field: 'eligibleMachines', message: 'must be a non-empty array of machine IDs' },
              ],
            },
          },
        },
      }),
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    await fill('Job ID', 'J7');
    await fill('Name', 'x');
    await fill(/Priority/, '11');
    await userEvent.click(submitButton());

    expect(await screen.findByText('must be an integer between 1 and 10')).toBeTruthy();
    expect(screen.getByText('must be a non-empty array of machine IDs')).toBeTruthy();
    expect(screen.getByText('Some fields need attention.')).toBeTruthy();
    expect((document.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(false); // can retry
  });

  it('shows a rule violation such as a missing dependency above the form', async () => {
    installFakeApi({
      'POST /api/jobs': () => apiError(422, 'MISSING_REFERENCE', 'Unknown dependency reference(s): J99'),
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    await userEvent.click(submitButton());

    expect((await screen.findByRole('alert')).textContent).toContain('Unknown dependency reference(s): J99');
  });

  it('refuses invalid JSON input without calling the server', async () => {
    const calls = installFakeApi({});
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    const input = field('Input data (JSON)');
    await userEvent.clear(input);
    await userEvent.type(input, 'not json');
    await userEvent.click(submitButton());

    expect(await screen.findByText(/must be valid JSON/)).toBeTruthy();
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(0);
  });

  it('swaps in the input template for the chosen operation until the text is edited', async () => {
    installFakeApi({});
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));

    await userEvent.selectOptions(field('Operation'), 'CHECK_METADATA');
    expect(field('Input data (JSON)').value).toContain('"author"');

    await userEvent.type(field('Input data (JSON)'), ' ');
    await userEvent.selectOptions(field('Operation'), 'GENERATE_SUMMARY');
    expect(field('Input data (JSON)').value).toContain('"author"'); // edited text is kept
  });

  it('closes the form on Cancel without sending anything', async () => {
    const calls = installFakeApi({});
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByText(/There are no jobs yet/);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Job ID')).toBeNull();
    expect(calls).toEqual(['GET /api/jobs']);
  });
});

describe('editing a job', () => {
  it('prefills the form, locks the ID and sends PUT to that job', async () => {
    let sent: Record<string, unknown> = {};
    const onSaved = vi.fn();
    installFakeApi({
      'GET /api/jobs': () => ({ json: [job('J1'), job('J2', { priority: 8, eligibleMachines: ['M1'], dependencies: ['J1'], inputData: { body: 'hello world' } })] }),
      'PUT /api/jobs/J2': (body) => {
        sent = JSON.parse(body as string);
        return { json: job('J2', { priority: 3 }) };
      },
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={onSaved} />);
    await screen.findByTestId('job-J2');

    await userEvent.click(screen.getByRole('button', { name: 'Edit J2' }));
    expect(field('Job ID').value).toBe('J2');
    expect(field('Job ID').disabled).toBe(true);
    expect(field(/Priority/).value).toBe('8');
    expect((within(screen.getByRole('group', { name: /Dependencies/ })).getByLabelText(/J1/) as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole('group', { name: /Dependencies/ })).queryByLabelText(/J2/)).toBeNull(); // not its own dependency
    expect(JSON.parse(field('Input data (JSON)').value)).toEqual({ body: 'hello world' });

    await fill(/Priority/, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toMatchObject({ id: 'J2', priority: 3, dependencies: ['J1'], eligibleMachines: ['M1'] });
    expect(onSaved.mock.calls[0]![0]).toBe('Job J2 updated. Generate a new schedule to include the change.');
  });

  it('shows the cycle message when an edit would create a dependency cycle', async () => {
    installFakeApi({
      'GET /api/jobs': () => ({ json: [job('J1'), job('J2', { dependencies: ['J1'] })] }),
      'PUT /api/jobs/J1': () => apiError(422, 'CIRCULAR_DEPENDENCY', 'Circular dependency: J1 -> J2 -> J1'),
    });
    render(<JobsPanel machines={machines} refreshToken={0} onSaved={() => {}} />);
    await screen.findByTestId('job-J1');
    await userEvent.click(screen.getByRole('button', { name: 'Edit J1' }));
    await userEvent.click(within(screen.getByRole('group', { name: /Dependencies/ })).getByLabelText(/J2/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findByRole('alert')).textContent).toContain('J1 -> J2 -> J1');
  });
});
