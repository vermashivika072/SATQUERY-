import { useState } from 'react';
import { Gauge, Donut, BarList } from './charts';
import { ProgressIndicator } from './ProgressIndicator';

export function ReportContent() {
  const [
    stage,
    setStage
  ] = useState(0);

  const [
    error,
    setError
  ] = useState<string | null>(
    null
  );

  const run = () => {
    if (stage > 0) return;

    setError(null);
    setStage(1);

    let s = 1;

    const iv = setInterval(() => {
      s += 1;
      setStage(s);

      if (s >= 4) {
        clearInterval(iv);

        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent(
              'geoai-report-export'
            )
          );

          setStage(0);
        }, 600);
      }
    }, 500);
  };

  return (
    <div
      className="window-body"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '10px',
        overflow: 'auto'
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700
        }}
      >
        Executive Summary
      </div>

      <p
        style={{
          fontSize: '9px',
          color:
            'var(--text-secondary)',
          lineHeight: '1.5',
          margin: 0
        }}
      >
        Simulated Ranchi corridor
        assessment: 21.6 km² changed,
        vegetation -12.4% vs 2022 baseline.
        No critical encroachment in parcel
        audit. Flood hazard moderate
        (4.85 km² high-risk). Mission
        telemetry nominal. DEMO DATA.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '8px'
        }}
      >
        <span
          style={{
            flex: 1,
            background:
              'var(--panel2)',
            border:
              '1px solid var(--border)',
            borderRadius: '6px',
            padding: '6px',
            textAlign: 'center'
          }}
        >
          <small
            style={{
              color:
                'var(--muted)',
              display: 'block',
              fontSize: '8px'
            }}
          >
            Affected features
          </small>
          <b>24</b>
        </span>

        <span
          style={{
            flex: 1,
            background:
              'var(--warning-soft)',
            border:
              '1px solid var(--warning)',
            borderRadius: '6px',
            padding: '6px',
            textAlign: 'center'
          }}
        >
          <small
            style={{
              color:
                'var(--muted)',
              display: 'block',
              fontSize: '8px'
            }}
          >
            Warning
          </small>
          <b
            style={{
              color:
                'var(--warning)'
            }}
          >
            Moderate
          </b>
        </span>

        <span
          style={{
            flex: 1,
            background:
              'var(--panel2)',
            border:
              '1px solid var(--border)',
            borderRadius: '6px',
            padding: '6px',
            textAlign: 'center'
          }}
        >
          <Gauge
            value={68}
            label="Risk"
          />
        </span>
      </div>

      {stage > 0 && (
        <ProgressIndicator
          stages={[
            {
              label:
                'Preparing report',
              status:
                stage > 1
                  ? 'done'
                  : stage === 1
                    ? 'active'
                    : 'pending'
            },
            {
              label: 'Compiling',
              status:
                stage === 2
                  ? 'active'
                  : stage > 2
                    ? 'done'
                    : 'pending'
            },
            {
              label:
                'Adding map info',
              status:
                stage === 3
                  ? 'active'
                  : stage > 3
                    ? 'done'
                    : 'pending'
            },
            {
              label: 'Generating',
              status:
                stage === 4
                  ? 'active'
                  : 'pending'
            }
          ]}
          message="Generating report"
        />
      )}

      {error && (
        <div
          className="alert danger"
          style={{
            fontSize: '9px'
          }}
        >
          {error}

          <button
            className="secondary"
            style={{
              height: '22px'
            }}
            onClick={() => {
              setError(null);
              setStage(0);
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '6px'
        }}
      >
        <button
          className="primary"
          style={{
            flex: 1,
            fontSize: '9px'
          }}
          disabled={stage > 0}
          onClick={run}
        >
          Export Report
        </button>

        <button
          className="secondary"
          style={{
            flex: 1,
            fontSize: '9px'
          }}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(
                'geoai-compare'
              )
            )
          }
        >
          Compare on Map
        </button>
      </div>
    </div>
  );
}
