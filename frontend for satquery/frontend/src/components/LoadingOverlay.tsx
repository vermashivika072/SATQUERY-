import { ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

type Props = {
  visible: boolean;
  label?: string;
  message?: string;
  spinner?: boolean;
  children?: ReactNode;
  className?: string;
  subtle?: boolean;
};

export function LoadingOverlay({ visible, label = 'Loading', message, spinner = true, children, className = '', subtle = false }: Props) {
  if (!visible) return null;
  return (
    <div className={`loading-overlay ${subtle ? 'loading-overlay--subtle' : ''} ${className}`} role="status" aria-label={message || label} aria-live="polite">
      <div className="loading-overlay__backdrop" aria-hidden="true" />
      <div className="loading-overlay__content">
        {spinner && <LoadingSpinner size="md" label={message || label} />}
        {children && <div className="loading-overlay__children">{children}</div>}
        {!spinner && !children && <span className="loading-overlay__label">{message || label}</span>}
      </div>
    </div>
  );
}

export default LoadingOverlay;
