const PROVENANCE_COLORS: Record<string, string> = {
  LIVE: '#16a34a',
  REAL: '#16a34a',
  DB: '#16a34a',
  HEURISTIC: '#d97706',
  SIMULATED: '#d97706',
  FALLBACK: '#6b7280',
  UNAVAILABLE: '#6b7280',
  CONFIG_ERROR: '#dc2626',
  OFFLINE: '#dc2626'
};

export const ProvenanceBadge = ({
  label,
  source
}: {
  label: string;
  source?: string;
}) => {
  const raw = source || 'UNAVAILABLE';
  const value =
    raw === 'CONFIG_ERROR'
      ? 'CONFIG ERROR'
      : raw;
  const color =
    PROVENANCE_COLORS[raw] || '#6b7280';

  return (
    <span
      title={`${label}: ${value}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '8px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        color,
        background: 'var(--panel2)',
        border: `1px solid ${color}`,
        padding: '1px 6px',
        borderRadius: '999px',
        lineHeight: 1.5
      }}
    >
      {label} · {value}
    </span>
  );
};