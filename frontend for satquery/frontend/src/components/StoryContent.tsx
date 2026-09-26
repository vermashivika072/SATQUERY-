import { useEffect, useState } from 'react';
import { LoadingDots } from './LoadingDots';

export function StoryContent() {
  const stages = [
    {
      year: '2018',
      label: 'Baseline',
      desc: 'Pre-urban fringe, NDVI 0.64'
    },
    {
      year: '2020',
      label: 'Expansion',
      desc: 'Road corridor opens'
    },
    {
      year: '2021',
      label: 'Monsoon',
      desc: 'Water extent +18%'
    },
    {
      year: '2022',
      label: 'Growth',
      desc: 'Built-up +4.1%'
    },
    {
      year: '2023',
      label: 'Current',
      desc: 'Mission assessment'
    },
    {
      year: '2024',
      label: 'Future',
      desc: 'Projected growth and changes'
    }
  ];

  const [
    idx,
    setIdx
  ] = useState(2);

  const [
    playing,
    setPlaying
  ] = useState(false);

  const [
    storyLoading,
    setStoryLoading
  ] = useState(false);

  const changeIdx = (
    v:
      | number
      | ((prev: number) => number)
  ) => {
    if (storyLoading) return;

    setStoryLoading(true);

    setTimeout(
      () =>
        setStoryLoading(false),
      350
    );

    setIdx(v as any);
  };

  useEffect(() => {
    if (!playing) return;

    const t = setInterval(
      () =>
        setIdx(
          v =>
            (v + 1) %
            stages.length
        ),
      900
    );

    return () =>
      clearInterval(t);
  }, [playing]);

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
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          padding: '4px 0'
        }}
      >
        {stages.map((s, i) => (
          <div
            key={s.year}
            onClick={() =>
              changeIdx(i)
            }
            style={{
              flex: '0 0 78px',
              cursor: 'pointer',
              textAlign: 'center',
              padding: '6px',
              borderRadius: '6px',
              border:
                '1px solid ' +
                (i === idx
                  ? 'var(--accent)'
                  : 'var(--border)'),
              background:
                i === idx
                  ? 'var(--accent-soft)'
                  : 'var(--panel2)'
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color:
                  i === idx
                    ? 'var(--accent)'
                    : 'var(--text)'
              }}
            >
              {s.year}
            </div>

            <div
              style={{
                fontSize: '8px',
                color:
                  'var(--muted)'
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          height: '4px',
          background:
            'var(--border)',
          borderRadius: '999px',
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(idx /
              (stages.length - 1)) *
              100
              }%`,
            top: '50%',
            transform:
              'translate(-50%,-50%)',
            width: '10px',
            height: '10px',
            background:
              'var(--accent)',
            borderRadius: '50%',
            border:
              '2px solid var(--panel)'
          }}
        />

        <div
          style={{
            height: '100%',
            width: `${(idx /
              (stages.length - 1)) *
              100
              }%`,
            background:
              'var(--accent)',
            borderRadius: '999px'
          }}
        />
      </div>

      {storyLoading && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <LoadingDots message="Loading" />
        </div>
      )}

      <p
        style={{
          fontSize: '9px',
          color:
            'var(--text-secondary)',
          margin: 0,
          lineHeight: '1.5'
        }}
      >
        {stages[idx].desc} ·
        Simulated narrative for Ranchi AOI.
        Vegetation +12.4% seasonal gain,
        water stable vs 10-year baseline.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '6px'
        }}
      >
        <button
          className="secondary"
          style={{
            flex: 1,
            fontSize: '9px'
          }}
          onClick={() =>
            changeIdx(v =>
              Math.max(0, v - 1)
            )
          }
        >
          Previous
        </button>

        <button
          className="secondary"
          style={{
            fontSize: '9px',
            minWidth: '48px'
          }}
          onClick={() =>
            setPlaying(v => !v)
          }
        >
          {playing
            ? 'Pause'
            : 'Play'}
        </button>

        <button
          className="secondary"
          style={{
            flex: 1,
            fontSize: '9px'
          }}
          onClick={() =>
            changeIdx(v =>
              Math.min(
                stages.length - 1,
                v + 1
              )
            )
          }
        >
          Next
        </button>
      </div>

      <button
        className="secondary"
        style={{
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
  );
}
