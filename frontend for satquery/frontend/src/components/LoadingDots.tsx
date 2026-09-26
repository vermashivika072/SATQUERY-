type Props = {
  label?: string;
  message?: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function LoadingDots({ label = 'Loading', message, size = 'sm', className = '' }: Props) {
  return (
    <span className={`loading-dots loading-dots--${size} ${className}`} role="status" aria-label={message || label} aria-live="polite">
      <span className="loading-dots__dot" />
      <span className="loading-dots__dot" />
      <span className="loading-dots__dot" />
      <span className="loading-dots__sr">{message || label}</span>
    </span>
  );
}

export default LoadingDots;
