import { CSSProperties } from 'react';

type Props = {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  message?: string;
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
};

const sizes: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 22 };

export function LoadingSpinner({ size = 'sm', label, message, inline = false, className = '', style }: Props) {
  const dim = sizes[size] ?? 16;
  return (
    <span
      className={`loading-spinner loading-spinner--${size} ${inline ? 'inline' : ''} ${className}`}
      role="status"
      aria-label={message || label || 'Loading'}
      aria-live="polite"
      style={style}
    >
      <span
        className="loading-spinner__circle"
        style={{ width: dim, height: dim }}
        aria-hidden="true"
      />
      {(message || label) && <span className="loading-spinner__label">{message || label}</span>}
    </span>
  );
}

export default LoadingSpinner;
