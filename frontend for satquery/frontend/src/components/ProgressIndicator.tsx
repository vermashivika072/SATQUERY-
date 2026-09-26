type Stage = {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
};

type Props = {
  value?: number;
  progress?: number;
  max?: number;
  stages?: Stage[];
  label?: string;
  message?: string;
  showPercent?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
};

export function ProgressIndicator({ value, progress, max = 100, stages, label, message, showPercent = true, error, onRetry, className = '' }: Props) {
  const raw = typeof progress === 'number' ? progress : value;
  const percent = typeof raw === 'number' ? Math.max(0, Math.min(100, (raw / max) * 100)) : undefined;
  const hasError = !!error;

  return (
    <div className={`progress-indicator ${hasError ? 'progress-indicator--error' : ''} ${className}`} role="status" aria-label={message || label || 'Progress'} aria-live="polite">
      {label && (
        <div className="progress-indicator__header">
          <span className="progress-indicator__label">{message || label}</span>
          {showPercent && typeof percent === 'number' && <span className="progress-indicator__percent">{Math.round(percent)}%</span>}
        </div>
      )}
      {typeof percent === 'number' && (
        <div className="progress-indicator__track" aria-hidden="true">
          <div className="progress-indicator__fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      {stages && stages.length > 0 && (
        <ol className="progress-indicator__stages">
          {stages.map((s, i) => (
            <li key={i} className={`progress-indicator__stage progress-indicator__stage--${s.status}`}>
              <span className="progress-indicator__dot" aria-hidden="true" />
              <span className="progress-indicator__stage-label">{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {hasError && (
        <div className="progress-indicator__error">
          <span className="progress-indicator__error-text">{error}</span>
          {onRetry && (
            <button className="progress-indicator__retry secondary" onClick={onRetry} type="button">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProgressIndicator;
