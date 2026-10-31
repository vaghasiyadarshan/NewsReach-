import { useState, type FormEvent, type ReactNode } from 'react';
import { OPERATION_TYPES, PRIORITY_MAX, PRIORITY_MIN, type OperationType } from '../../../server/src/domain/models/job.ts';
import { api, ApiError, errorMessage, fieldIssuesOf } from '../api/client.ts';
import type { JobDto, MachineDto } from '../api/types.ts';
import { INPUT_TEMPLATES } from '../jobTemplates.ts';

interface Props {
  machines: MachineDto[];
  /** Every stored job, to offer as possible dependencies. */
  jobs: JobDto[];
  /** The job being edited, or null to add a new one. */
  editing: JobDto | null;
  onCancel: () => void;
  onSaved: (job: JobDto, mode: 'created' | 'updated') => void;
}

interface Values {
  id: string;
  name: string;
  operationType: OperationType;
  duration: string;
  releaseTime: string;
  deadline: string;
  priority: string;
  eligibleMachines: string[];
  dependencies: string[];
  inputText: string;
}

function initialValues(job: JobDto | null): Values {
  if (!job) {
    return {
      id: '',
      name: '',
      operationType: 'COUNT_WORDS',
      duration: '1',
      releaseTime: '0',
      deadline: '12',
      priority: '5',
      eligibleMachines: [],
      dependencies: [],
      inputText: INPUT_TEMPLATES.COUNT_WORDS,
    };
  }
  return {
    id: job.id,
    name: job.name,
    operationType: job.operationType,
    duration: String(job.duration),
    releaseTime: String(job.releaseTime),
    deadline: String(job.deadline),
    priority: String(job.priority),
    eligibleMachines: [...job.eligibleMachines],
    dependencies: [...job.dependencies],
    inputText: JSON.stringify(job.inputData, null, 2),
  };
}

/** Empty stays empty so the server reports it; text that is not a number is sent as NaN and rejected. */
const toNumber = (text: string): number | undefined => (text.trim() === '' ? undefined : Number(text));

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function Field(props: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.children}
      {props.hint && !props.error && <p className="hint">{props.hint}</p>}
      {props.error && (
        <p className="field-error" id={`${props.id}-error`}>
          {props.error}
        </p>
      )}
    </div>
  );
}

export function JobForm({ machines, jobs, editing, onCancel, onSaved }: Props) {
  const [values, setValues] = useState<Values>(() => initialValues(editing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  /** Switching operation swaps in that operation's input template, unless the text was edited. */
  function changeOperation(next: OperationType) {
    setValues((v) => ({
      ...v,
      operationType: next,
      inputText: v.inputText === INPUT_TEMPLATES[v.operationType] ? INPUT_TEMPLATES[next] : v.inputText,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    let inputData: unknown;
    try {
      inputData = JSON.parse(values.inputText.trim() === '' ? '{}' : values.inputText);
    } catch {
      setErrors({ inputData: 'must be valid JSON, for example {"body": "text"}' });
      return;
    }

    setSaving(true);
    try {
      const body = {
        id: values.id.trim(),
        name: values.name,
        operationType: values.operationType,
        duration: toNumber(values.duration),
        releaseTime: toNumber(values.releaseTime),
        deadline: toNumber(values.deadline),
        priority: toNumber(values.priority),
        eligibleMachines: values.eligibleMachines,
        dependencies: values.dependencies,
        inputData,
      };
      const saved = editing ? await api.updateJob(editing.id, body) : await api.createJob(body);
      onSaved(saved, editing ? 'updated' : 'created');
    } catch (error) {
      const issues = fieldIssuesOf(error);
      if (issues.length > 0) {
        setErrors(Object.fromEntries(issues.map((i) => [i.field, i.message])));
        setFormError('Some fields need attention.');
      } else {
        setFormError(error instanceof ApiError ? error.message : errorMessage(error));
      }
      setSaving(false);
    }
  }

  const otherJobs = jobs.filter((j) => j.id !== editing?.id);

  return (
    <form className="job-form" onSubmit={(e) => void submit(e)} noValidate aria-label={editing ? `Edit job ${editing.id}` : 'Add job'}>
      <h3>{editing ? `Edit job ${editing.id}` : 'Add job'}</h3>

      {formError && (
        <div className="banner error" role="alert">
          {formError}
        </div>
      )}

      <div className="form-grid">
        <Field id="job-id" label="Job ID" error={errors.id} hint="Letters, digits, - or _ (cannot be changed later)">
          <input id="job-id" value={values.id} disabled={editing !== null} onChange={(e) => set('id', e.target.value)} aria-describedby={errors.id ? 'job-id-error' : undefined} />
        </Field>
        <Field id="job-name" label="Name" error={errors.name}>
          <input id="job-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field id="job-operation" label="Operation" error={errors.operationType}>
          <select id="job-operation" value={values.operationType} onChange={(e) => changeOperation(e.target.value as OperationType)}>
            {OPERATION_TYPES.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </Field>
        <Field id="job-priority" label={`Priority (${PRIORITY_MIN} to ${PRIORITY_MAX})`} error={errors.priority}>
          <input id="job-priority" inputMode="numeric" value={values.priority} onChange={(e) => set('priority', e.target.value)} />
        </Field>
        <Field id="job-duration" label="Duration (slots)" error={errors.duration}>
          <input id="job-duration" inputMode="numeric" value={values.duration} onChange={(e) => set('duration', e.target.value)} />
        </Field>
        <Field id="job-release" label="Release time" error={errors.releaseTime} hint="Earliest slot it may start">
          <input id="job-release" inputMode="numeric" value={values.releaseTime} onChange={(e) => set('releaseTime', e.target.value)} />
        </Field>
        <Field id="job-deadline" label="Deadline" error={errors.deadline} hint="Slot by which it must finish">
          <input id="job-deadline" inputMode="numeric" value={values.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </Field>
      </div>

      <fieldset className="field">
        <legend>Eligible machines</legend>
        <div className="checks">
          {machines.map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={values.eligibleMachines.includes(m.id)} onChange={() => set('eligibleMachines', toggle(values.eligibleMachines, m.id))} />
              {m.id} <span className="muted">{m.name}</span>
            </label>
          ))}
        </div>
        {errors.eligibleMachines && <p className="field-error">{errors.eligibleMachines}</p>}
      </fieldset>

      <fieldset className="field">
        <legend>Dependencies (must finish first)</legend>
        {otherJobs.length === 0 ? (
          <p className="hint">No other jobs yet.</p>
        ) : (
          <div className="checks">
            {otherJobs.map((j) => (
              <label key={j.id} className="check">
                <input type="checkbox" checked={values.dependencies.includes(j.id)} onChange={() => set('dependencies', toggle(values.dependencies, j.id))} />
                {j.id} <span className="muted">{j.name}</span>
              </label>
            ))}
          </div>
        )}
        {errors.dependencies && <p className="field-error">{errors.dependencies}</p>}
      </fieldset>

      <Field id="job-input" label="Input data (JSON)" error={errors.inputData} hint="What the operation reads, for example the article body">
        <textarea id="job-input" rows={6} spellCheck={false} value={values.inputText} onChange={(e) => set('inputText', e.target.value)} />
      </Field>

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add job'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
