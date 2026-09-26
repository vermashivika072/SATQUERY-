export function Gauge({
  value,
  label,
  sub
}: {
  value: number;
  label: string;
  sub?: string;
}) {
  const pct = Math.max(
    0,
    Math.min(100, value)
  );

  const r = 28;
  const c = 2 * Math.PI * r;
  const off =
    c - (pct / 100) * c;

  return (
    <div
      className="gauge-wrap"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '64px',
          height: '64px'
        }}
      >
        <svg
          width="64"
          height="64"
          style={{
            transform:
              'rotate(-90deg)'
          }}
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            stroke="var(--border)"
            strokeWidth="6"
            fill="none"
          />

          <circle
            cx="32"
            cy="32"
            r={r}
            stroke="var(--accent)"
            strokeWidth="6"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="round"
          />
        </svg>

        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text)'
          }}
        >
          {pct}%
        </span>
      </div>

      <small
        style={{
          fontSize: '8px',
          color: 'var(--muted)',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          fontWeight: 600
        }}
      >
        {label}
      </small>

      {sub && (
        <small
          style={{
            fontSize: '8px',
            color: 'var(--muted)'
          }}
        >
          {sub}
        </small>
      )}
    </div>
  );
}

export function Donut({
  parts
}: {
  parts: {
    label: string;
    value: number;
    color: string;
  }[];
}) {
  const total =
    parts.reduce(
      (a, b) => a + b.value,
      0
    ) || 1;

  let acc = 0;

  const r = 26;
  const c = 2 * Math.PI * r;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '64px',
          height: '64px'
        }}
      >
        <svg
          width="64"
          height="64"
          style={{
            transform:
              'rotate(-90deg)'
          }}
        >
          <circle
            cx="32"
            cy="32"
            r={r}
            stroke="var(--border)"
            strokeWidth="10"
            fill="none"
          />

          {parts.map(p => {
            const len =
              (p.value / total) * c;

            const el = (
              <circle
                key={p.label}
                cx="32"
                cy="32"
                r={r}
                stroke={p.color}
                strokeWidth="10"
                fill="none"
                strokeDasharray={`${len} ${c - len
                  }`}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
              />
            );

            acc += len;

            return el;
          })}
        </svg>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '3px'
        }}
      >
        {parts.map(p => (
          <span
            key={p.label}
            style={{
              fontSize: '9px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i
              style={{
                width: '8px',
                height: '8px',
                background: p.color,
                borderRadius: '2px',
                display: 'inline-block'
              }}
            />

            {p.label}

            <b
              style={{
                marginLeft: 'auto'
              }}
            >
              {p.value}%
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarList({
  items
}: {
  items: {
    label: string;
    value: number;
    color: string;
  }[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}
    >
      {items.map(it => (
        <div
          key={it.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              fontSize: '9px'
            }}
          >
            <span
              style={{
                color:
                  'var(--text-secondary)'
              }}
            >
              {it.label}
            </span>

            <b
              style={{
                color: 'var(--text)'
              }}
            >
              {it.value}%
            </b>
          </div>

          <div
            style={{
              height: '6px',
              background:
                'var(--border)',
              borderRadius: '999px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${it.value}%`,
                height: '100%',
                background: it.color,
                borderRadius: '999px'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}