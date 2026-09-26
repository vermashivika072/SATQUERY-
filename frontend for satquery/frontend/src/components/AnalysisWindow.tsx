import { useRef } from 'react';
import { LoadingDots } from './LoadingDots';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { Win, WindowType } from '../types';
import { getWorkspaceRect } from '../lib/workspace';
import { Gauge, Donut, BarList } from './charts';
import { StoryContent } from './StoryContent';
import { ReportContent } from './ReportContent';
import type * as React from 'react';

export function AnalysisWindow({
  item,
  onFocus,
  onHide,
  onPatch,
  windowLoading,
  windowError,
  onRetry
}: {
  item: Win;
  onFocus: () => void;
  onHide: () => void;
  onPatch: (
    value: Partial<Win>
  ) => void;
  windowLoading?: Record<
    string,
    boolean
  >;
  windowError?: Record<
    string,
    string | null
  >;
  onRetry?: (
    type: WindowType
  ) => void;
}) {
  const start = useRef<{
    x: number;
    y: number;
    w: Win;
    edge?: string;
  } | null>(null);

  const pointer = (
    event: React.PointerEvent,
    edge?: string
  ) => {
    if (
      (
        event.target as HTMLElement
      ).closest('button')
    ) {
      return;
    }

    event.preventDefault();

    start.current = {
      x: event.clientX,
      y: event.clientY,
      w: { ...item },
      edge
    };

    const move = (
      next: PointerEvent
    ) => {
      const state =
        start.current;

      if (!state) return;

      const rect =
        getWorkspaceRect();

      const boundsW = rect
        ? rect.width
        : window.innerWidth;

      const boundsH = rect
        ? rect.height
        : window.innerHeight;

      let {
        x,
        y,
        width,
        height
      } = state.w;

      const dx =
        next.clientX - state.x;

      const dy =
        next.clientY - state.y;

      if (!edge) {
        x =
          state.w.x + dx;

        y =
          state.w.y + dy;

        x = Math.max(
          0,
          Math.min(
            x,
            boundsW - width
          )
        );

        y = Math.max(
          0,
          Math.min(
            y,
            boundsH - height
          )
        );

        onPatch({ x, y });

        return;
      }

      if (edge.includes('e')) {
        width = Math.max(
          300,
          state.w.width + dx
        );
      }

      if (edge.includes('s')) {
        height = Math.max(
          180,
          state.w.height + dy
        );
      }

      if (edge.includes('w')) {
        width = Math.max(
          300,
          state.w.width - dx
        );

        x =
          state.w.x +
          state.w.width -
          width;
      }

      if (edge.includes('n')) {
        height = Math.max(
          180,
          state.w.height - dy
        );

        y =
          state.w.y +
          state.w.height -
          height;
      }

      if (width > boundsW) {
        width = boundsW;
      }

      if (height > boundsH) {
        height = boundsH;
      }

      x = Math.max(
        0,
        Math.min(
          x,
          boundsW - width
        )
      );

      y = Math.max(
        0,
        Math.min(
          y,
          boundsH - height
        )
      );

      onPatch({
        x,
        y,
        width,
        height
      });
    };

    const up = () => {
      start.current = null;

      window.removeEventListener(
        'pointermove',
        move
      );

      window.removeEventListener(
        'pointerup',
        up
      );
    };

    window.addEventListener(
      'pointermove',
      move
    );

    window.addEventListener(
      'pointerup',
      up,
      { once: true }
    );
  };

  const isLoading =
    windowLoading?.[item.type];

  const error =
    windowError?.[item.type];

  if (error) {
    return (
      <div
        className="window-body"
        style={{
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div
          className="alert danger"
          style={{
            fontSize: '9px'
          }}
        >
          {error}
        </div>

        <button
          className="secondary"
          style={{
            height: '26px',
            fontSize: '9px'
          }}
          onClick={() =>
            onRetry?.(item.type)
          }
        >
          Retry
        </button>

        <button
          className="secondary"
          style={{
            height: '26px',
            fontSize: '9px'
          }}
          onClick={onHide}
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="window-body"
        style={{
          padding: '10px'
        }}
      >
        <LoadingSkeleton lines={4} />

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '8px'
          }}
        >
          <LoadingDots message="Loading" />
        </div>
      </div>
    );
  }

  const content = (() => {
    const demoAOI =
      '142.5 km²';

    switch (item.type) {
      case 'mission':
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
                justifyContent:
                  'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text)'
                  }}
                >
                  Ranchi Land Change 2023
                </div>

                <div
                  style={{
                    fontSize: '9px',
                    color: 'var(--muted)'
                  }}
                >
                  AOI · {demoAOI} · Jharkhand ·
                  23.3441° N, 85.3096° E
                </div>
              </div>

              <span
                className="tag"
                style={{
                  fontSize: '8px',
                  background:
                    'var(--accent-soft)',
                  color: 'var(--accent)',
                  padding: '2px 6px',
                  borderRadius:
                    '999px',
                  fontWeight: 600
                }}
              >
                ACTIVE
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}
            >
              <Gauge
                value={84.7}
                label="Confidence"
                sub="Sentinel-2"
              />

              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
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
                        'var(--muted)'
                    }}
                  >
                    Sentinel-2 scenes
                  </span>
                  <b>24</b>
                </div>

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
                        'var(--muted)'
                    }}
                  >
                    Landsat-8 scenes
                  </span>
                  <b>18</b>
                </div>

                <div
                  style={{
                    height: '6px',
                    background:
                      'var(--border)',
                    borderRadius:
                      '999px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: '68%',
                      height: '100%',
                      background:
                        'var(--accent)'
                    }}
                  />
                </div>

                <span
                  style={{
                    fontSize: '8px',
                    color:
                      'var(--muted)'
                  }}
                >
                  Progress 68% · Status:
                  In Progress
                </span>
              </div>
            </div>

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
                  window.dispatchEvent(
                    new CustomEvent(
                      'geoai-locate',
                      {
                        detail: [
                          23.3441,
                          85.3096
                        ]
                      }
                    )
                  )
                }
              >
                Locate on Map
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
                      'geoai-use-aoi',
                      {
                        detail: [
                          [
                            23.25,
                            85.14
                          ],
                          [
                            23.25,
                            85.46
                          ],
                          [
                            23.42,
                            85.46
                          ],
                          [
                            23.42,
                            85.14
                          ]
                        ]
                      }
                    )
                  )
                }
              >
                Use as AOI
              </button>

              <button
                className="primary"
                style={{
                  flex: 1,
                  fontSize: '9px'
                }}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(
                      'geoai-apply-layer',
                      {
                        detail: 'ndvi'
                      }
                    )
                  )
                }
              >
                Apply NDVI
              </button>
            </div>
          </div>
        );

      case 'spectral':
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
                justifyContent:
                  'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '10px',
                    color:
                      'var(--muted)',
                    letterSpacing:
                      '0.6px',
                    fontWeight: 600
                  }}
                >
                  SELECTED INDEX
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  NDVI · B8 / B4
                </div>
              </div>

              <span
                style={{
                  fontSize: '9px',
                  background:
                    'var(--panel2)',
                  border:
                    '1px solid var(--border)',
                  padding: '3px 6px',
                  borderRadius: '6px'
                }}
              >
                14 Sep 2023
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
              }}
            >
              <Gauge
                value={72}
                label="Mean NDVI"
                sub="0.72"
              />

              <Donut
                parts={[
                  {
                    label:
                      'Vegetation',
                    value: 42,
                    color:
                      '#65A30D'
                  },
                  {
                    label: 'Water',
                    value: 18,
                    color:
                      '#0EA5E9'
                  },
                  {
                    label: 'Other',
                    value: 40,
                    color:
                      'var(--border)'
                  }
                ]}
              />
            </div>

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
                  window.dispatchEvent(
                    new CustomEvent(
                      'geoai-apply-layer',
                      {
                        detail: 'ndvi'
                      }
                    )
                  )
                }
              >
                Apply Layer
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

      case 'story':
        return <StoryContent />;

      case 'explain':
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
                gap: '10px'
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection:
                    'column',
                  gap: '6px'
                }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    color:
                      'var(--muted)',
                    letterSpacing:
                      '0.6px',
                    fontWeight: 600
                  }}
                >
                  PARCEL · KH-892/402
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  Agricultural · Ranchi,
                  Jharkhand
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: '6px',
                    fontSize: '9px'
                  }}
                >
                  <span
                    style={{
                      background:
                        'var(--panel2)',
                      padding: '6px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--border)'
                    }}
                  >
                    <small
                      style={{
                        color:
                          'var(--muted)',
                        display: 'block'
                      }}
                    >
                      Risk score
                    </small>
                    <b
                      style={{
                        color:
                          'var(--warning)'
                      }}
                    >
                      42 / 100
                    </b>
                  </span>

                  <span
                    style={{
                      background:
                        'var(--panel2)',
                      padding: '6px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--border)'
                    }}
                  >
                    <small
                      style={{
                        color:
                          'var(--muted)',
                        display: 'block'
                      }}
                    >
                      Weather
                    </small>
                    <b>
                      28.6°C · Clear
                    </b>
                  </span>

                  <span
                    style={{
                      background:
                        'var(--panel2)',
                      padding: '6px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--border)'
                    }}
                  >
                    <small
                      style={{
                        color:
                          'var(--muted)',
                        display: 'block'
                      }}
                    >
                      Structures
                    </small>
                    <b>
                      12 detected
                    </b>
                  </span>

                  <span
                    style={{
                      background:
                        'var(--panel2)',
                      padding: '6px',
                      borderRadius:
                        '6px',
                      border:
                        '1px solid var(--border)'
                    }}
                  >
                    <small
                      style={{
                        color:
                          'var(--muted)',
                        display: 'block'
                      }}
                    >
                      Land use
                    </small>
                    <b>
                      Paddy · 64%
                    </b>
                  </span>
                </div>
              </div>

              <div
                style={{
                  width: '92px',
                  height: '92px',
                  background:
                    'var(--surface-soft)',
                  border:
                    '1px solid var(--border)',
                  borderRadius: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '8px',
                  color:
                    'var(--muted)',
                  flexShrink: 0
                }}
              >
                AOI
                <br />
                Thumbnail
                <br />
                23.34°N 85.30°E
              </div>
            </div>

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
                  window.dispatchEvent(
                    new CustomEvent(
                      'geoai-locate',
                      {
                        detail: [
                          23.3441,
                          85.3096
                        ]
                      }
                    )
                  )
                }
              >
                Locate on Map
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
                      'geoai-use-aoi',
                      {
                        detail: [
                          [
                            23.25,
                            85.14
                          ],
                          [
                            23.25,
                            85.46
                          ],
                          [
                            23.42,
                            85.46
                          ],
                          [
                            23.42,
                            85.14
                          ]
                        ]
                      }
                    )
                  )
                }
              >
                Use as AOI
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
                      'geoai-apply-layer',
                      {
                        detail: 'parcel'
                      }
                    )
                  )
                }
              >
                Show Parcel Layer
              </button>
            </div>
          </div>
        );

      case 'report':
        return <ReportContent />;

      case 'change':
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
                justifyContent:
                  'space-between',
                fontSize: '9px'
              }}
            >
              <span>
                <small
                  style={{
                    color:
                      'var(--muted)',
                    display: 'block'
                  }}
                >
                  BEFORE
                </small>
                <b>
                  14 Sep 2022
                </b>
              </span>

              <span>
                <small
                  style={{
                    color:
                      'var(--muted)',
                    display: 'block'
                  }}
                >
                  AFTER
                </small>
                <b>
                  14 Sep 2023
                </b>
              </span>

              <span>
                <small
                  style={{
                    color:
                      'var(--muted)',
                    display: 'block'
                  }}
                >
                  METHOD
                </small>
                <b>
                  NDVI differencing
                </b>
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  background:
                    'var(--panel2)',
                  border:
                    '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '8px',
                  textAlign: 'center'
                }}
              >
                <small
                  style={{
                    color:
                      'var(--muted)',
                    display: 'block'
                  }}
                >
                  Changed area
                </small>
                <b>
                  21.6 km²
                </b>
              </div>

              <BarList
                items={[
                  {
                    label:
                      'Vegetation',
                    value: 42,
                    color:
                      '#65A30D'
                  },
                  {
                    label:
                      'Built-up',
                    value: 28,
                    color:
                      '#C87A2C'
                  },
                  {
                    label: 'Water',
                    value: 18,
                    color:
                      '#0284C7'
                  },
                  {
                    label:
                      'Bare soil',
                    value: 12,
                    color:
                      '#9CA3AF'
                  }
                ]}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <Gauge
                value={78}
                label="Confidence"
              />

              <button
                className="secondary"
                style={{
                  flex: 1,
                  fontSize: '9px',
                  height: '28px'
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

      default:
        return (
          <div
            className="window-body"
            style={{
              padding: '10px',
              fontSize: '9px'
            }}
          >
            No content
          </div>
        );
    }
  })();

  return (
    <section
      className="floating-window active"
      onPointerDown={onFocus}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex
      }}
    >
      <div
        className="window-titlebar"
        onPointerDown={e =>
          pointer(e)
        }
      >
        <span className="drag-icon">
          ≡
        </span>

        <strong>
          {item.title}
        </strong>

        <span className="demo">
          DEMO
        </span>

        <span className="win-spacer" />

        <button
          className="win-control"
          onClick={onHide}
          title="Hide window"
        >
          —
        </button>
      </div>

      {content}

      {[
        'n',
        's',
        'e',
        'w',
        'ne',
        'nw',
        'se',
        'sw'
      ].map(edge => (
        <i
          key={edge}
          className={`window-resize-handle ${edge}`}
          data-resize={edge}
          onPointerDown={e =>
            pointer(e, edge)
          }
        />
      ))}
    </section>
  );
}