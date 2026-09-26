import { useState } from 'react';
import { ProgressIndicator } from './ProgressIndicator';
import { timelineDates } from '../lib/constants';

export function CompareDialog({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (
    from: string,
    to: string
  ) => void;
}) {
  const [
    from,
    setFrom
  ] = useState(
    timelineDates[4]
  );

  const [
    to,
    setTo
  ] = useState(
    timelineDates[8]
  );

  const [
    stage,
    setStage
  ] = useState(0);

  const [
    cError,
    setCError
  ] = useState<string | null>(
    null
  );

  const run = () => {
    if (stage > 0) return;

    setCError(null);
    setStage(1);

    setTimeout(
      () => setStage(2),
      500
    );

    setTimeout(
      () => setStage(3),
      1000
    );

    setTimeout(
      () => setStage(4),
      1500
    );

    setTimeout(() => {
      setStage(0);
      onConfirm(from, to);
    }, 2000);
  };

  return (
    <div
      className="compare-overlay"
      role="dialog"
      aria-modal="true"
    >
      <section className="compare-dialog compare-workspace">
        <header>
          <strong>
            Compare observations
            <small>
              API READY
            </small>
          </strong>

          <button
            onClick={onClose}
          >
            ·
          </button>
        </header>

        <p>
          Current AOI · synchronized
          pan, zoom and location
        </p>

        <div className="compare-dates">
          <label>
            FROM
            <select
              value={from}
              onChange={e =>
                setFrom(
                  e.target.value
                )
              }
            >
              {timelineDates.map(
                date => (
                  <option
                    key={date}
                  >
                    {date}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            TO
            <select
              value={to}
              onChange={e =>
                setTo(
                  e.target.value
                )
              }
            >
              {timelineDates.map(
                date => (
                  <option
                    key={date}
                  >
                    {date}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className="compare-stats">
          <span>
            <b>Vegetation</b>
            -12.4%
          </span>

          <span>
            <b>Built-up</b>
            +18.7%
          </span>

          <span>
            <b>Water</b>
            +6.3%
          </span>

          <span>
            <b>Changed area</b>
            21.6 km²
          </span>
        </div>

        {stage > 0 && (
          <ProgressIndicator
            stages={[
              {
                label:
                  'Preparing imagery',
                status:
                  stage > 1
                    ? 'done'
                    : stage === 1
                      ? 'active'
                      : 'pending'
              },
              {
                label:
                  'Comparing dates',
                status:
                  stage === 2
                    ? 'active'
                    : stage > 2
                      ? 'done'
                      : 'pending'
              },
              {
                label:
                  'Detecting changes',
                status:
                  stage === 3
                    ? 'active'
                    : stage > 3
                      ? 'done'
                      : 'pending'
              },
              {
                label:
                  'Finalizing result',
                status:
                  stage === 4
                    ? 'active'
                    : 'pending'
              }
            ]}
            message="Processing"
          />
        )}

        {cError && (
          <div
            className="alert danger"
            style={{
              fontSize: '9px',
              marginTop: '6px'
            }}
          >
            {cError}

            <button
              className="secondary"
              style={{
                height: '22px'
              }}
              onClick={() => {
                setCError(null);
                setStage(0);
              }}
            >
              Retry
            </button>
          </div>
        )}

        <button
          className="auth-submit"
          onClick={run}
          disabled={stage > 0}
        >
          {stage === 0
            ? 'OPEN SPLIT COMPARISON'
            : stage === 1
              ? 'Preparing…'
              : stage === 2
                ? 'Comparing…'
                : stage === 3
                  ? 'Detecting…'
                  : 'Finalizing…'}
        </button>
      </section>
    </div>
  );
}
