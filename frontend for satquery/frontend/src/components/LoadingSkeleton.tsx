type Props = {
  lines?: number;
  widths?: string[];
  height?: string;
  gap?: string;
  className?: string;
  variant?: 'text' | 'card' | 'chart';
};

export function LoadingSkeleton({ lines = 3, widths, height = '10px', gap = '8px', className = '', variant = 'text' }: Props) {
  if (variant === 'card') {
    return (
      <div className={`loading-skeleton loading-skeleton--card ${className}`} aria-hidden="true">
        <div className="loading-skeleton__block" style={{ height: '64px', marginBottom: gap }} />
        <div className="loading-skeleton__line" style={{ height, width: '60%' }} />
        <div className="loading-skeleton__line" style={{ height, width: '85%' }} />
      </div>
    );
  }
  if (variant === 'chart') {
    return (
      <div className={`loading-skeleton loading-skeleton--chart ${className}`} aria-hidden="true">
        <div className="loading-skeleton__block" style={{ height: '92px', marginBottom: gap }} />
        <div className="loading-skeleton__line" style={{ height, width: '45%' }} />
      </div>
    );
  }
  const w = widths && widths.length ? widths : Array.from({ length: lines }, (_, i) => (i === lines - 1 ? '68%' : i % 3 === 0 ? '92%' : '76%'));
  return (
    <div className={`loading-skeleton ${className}`} style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
      {w.map((width, i) => (
        <div key={i} className="loading-skeleton__line" style={{ height, width }} />
      ))}
    </div>
  );
}

export default LoadingSkeleton;
