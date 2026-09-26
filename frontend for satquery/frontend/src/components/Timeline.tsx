import { LoadingSpinner } from './LoadingSpinner';
import { timelineDates } from '../lib/constants';
import type * as React from 'react';

export function Timeline({
  timelineLoading, playing, setPlaying, dateIndex, setDateIndex,
  timelineHover, setTimelineHover, hoveredIndex, setHoveredIndex,
  timelineTooltipPosition, setTimelineTooltipPosition,
  setTimeline, isCompareMode, onToggleCompare
}: {
  timelineLoading: boolean;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  dateIndex: number;
  setDateIndex: React.Dispatch<React.SetStateAction<number>>;
  timelineHover: boolean;
  setTimelineHover: React.Dispatch<React.SetStateAction<boolean>>;
  hoveredIndex: number;
  setHoveredIndex: React.Dispatch<React.SetStateAction<number>>;
  timelineTooltipPosition: number;
  setTimelineTooltipPosition: React.Dispatch<React.SetStateAction<number>>;
  setTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  isCompareMode: boolean;
  onToggleCompare: () => void;
}) {
  return (
        <section className="timeline timeline-panel w-full relative overflow-hidden m-0">
          <div className="timeline-header-row flex justify-between items-center w-full">
            <div className="flex items-center gap-2">
              <span className="timeline-dot" />

              {timelineLoading && (
                <LoadingSpinner
                  size="xs"
                  message="Updating observation…"
                />
              )}

              <strong
                className="timeline-title"
                style={{
                  letterSpacing:
                    '0.12em'
                }}
              >
                TIMELINE | SIMULATED
                OBSERVATION ARCHIVE ·
                SENTINEL-2
              </strong>
            </div>

            <button
              className="timeline-close"
              onClick={() =>
                setTimeline(false)
              }
            >
              —
            </button>
          </div>

          <div className="timeline-controls flex items-center w-full gap-3">
            <div className="timeline-left-controls">
              <button
                className="playback-btn"
                onClick={() =>
                  setPlaying(
                    value =>
                      !value
                  )
                }
              >
                {playing
                  ? '⏸'
                  : '▶'}
              </button>
            </div>

            <div className="timeline-scrubber-container flex-1 flex items-center gap-2 min-w-0">
              <span className="timeline-date-label">
                {
                  timelineDates[0]
                }
              </span>

              <label
                className="timeline-slider-wrap flex-1 min-w-0"
                onMouseEnter={() =>
                  setTimelineHover(
                    true
                  )
                }
                onMouseLeave={() =>
                  setTimelineHover(
                    false
                  )
                }
                onMouseMove={e => {
                  const rect =
                    (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();

                  const x =
                    e.clientX -
                    rect.left;

                  const pct =
                    Math.max(
                      0,
                      Math.min(
                        1,
                        x /
                        rect.width
                      )
                    );

                  const idx =
                    Math.round(
                      pct *
                      (timelineDates.length -
                        1)
                    );

                  setHoveredIndex(
                    idx
                  );

                  setTimelineTooltipPosition(
                    pct * 100
                  );
                }}
              >
                <input
                  className="timeline-slider"
                  type="range"
                  min="0"
                  max={
                    timelineDates.length -
                    1
                  }
                  value={
                    dateIndex
                  }
                  onChange={e =>
                    setDateIndex(
                      +e.target
                        .value
                    )
                  }
                />

                {timelineHover && (
                  <div
                    className="timeline-tooltip"
                    style={{
                      left:
                        timelineTooltipPosition +
                        '%'
                    }}
                  >
                    {
                      timelineDates[
                      hoveredIndex
                      ]
                    }{' '}
                    · Sentinel-2 ·
                    DEMO SCENE
                  </div>
                )}
              </label>

              <span className="timeline-date-label">
                {
                  timelineDates[
                  timelineDates.length -
                  1
                  ]
                }
              </span>
            </div>

            <div className="timeline-right-controls">
              <button
                className={`compare-button ${isCompareMode
                  ? 'is-active'
                  : ''
                  }`}
                onClick={onToggleCompare}
                aria-pressed={isCompareMode}
                title={
                  isCompareMode
                    ? 'Exit split-screen compare'
                    : 'Split the map into a synced comparison'
                }
              >
                <span className="compare-icon">
                  ⇄
                </span>

                <span className="compare-label">
                  COMPARE
                </span>
              </button>
            </div>
          </div>
        </section>
  );
}