export type Action = 'generate' | 'run' | 'reset';

interface Props {
  busy: Action | null;
  canRun: boolean;
  runHint: string | null;
  onGenerate: () => void;
  onRun: () => void;
  onReset: () => void;
}

export function ActionBar({ busy, canRun, runHint, onGenerate, onRun, onReset }: Props) {
  const disabled = busy !== null;
  return (
    <div className="actions" role="group" aria-label="Schedule actions">
      <button className="primary" onClick={onGenerate} disabled={disabled}>
        {busy === 'generate' ? 'Generating…' : 'Generate Schedule'}
      </button>
      <button className="primary" onClick={onRun} disabled={disabled || !canRun} title={runHint ?? undefined}>
        {busy === 'run' ? 'Running…' : 'Run Schedule'}
      </button>
      <button onClick={onReset} disabled={disabled}>
        {busy === 'reset' ? 'Resetting…' : 'Reset Sample Data'}
      </button>
    </div>
  );
}
