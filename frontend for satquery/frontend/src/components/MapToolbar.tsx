import type { Chat, Tool } from '../types';
import type { LayerModel, MapMode, MapState } from '../maps/MapWorkspace';
import { timelineDates } from '../lib/constants';
import type * as React from 'react';

export function MapToolbar({
  map, setMap, setMapLoading, open, panel, setPanel, mode, setMode,
  layers, patchLayer, chat, dateIndex
}: {
  map: MapState;
  setMap: React.Dispatch<React.SetStateAction<MapState>>;
  setMapLoading: React.Dispatch<React.SetStateAction<boolean>>;
  open: (title: string) => void;
  panel: string;
  setPanel: React.Dispatch<React.SetStateAction<string>>;
  mode: MapMode;
  setMode: React.Dispatch<React.SetStateAction<MapMode>>;
  layers: LayerModel[];
  patchLayer: (id: string, value: Partial<LayerModel>) => void;
  chat?: Chat;
  dateIndex: number;
}) {
  return (
    <>
      <div className="floating-toolbar">
                <select
                  value={
                    map.basemap
                  }
                  onChange={e => {
                    setMapLoading(
                      true
                    );

                    setTimeout(
                      () =>
                        setMapLoading(
                          false
                        ),
                      650
                    );

                    setMap(
                      current => ({
                        ...current,
                        basemap:
                          e.target
                            .value as MapState['basemap']
                      })
                    );
                  }}
                >
                  <option>
                    OSM Standard
                  </option>
                  <option>
                    Satellite
                  </option>
                  <option>
                    Terrain
                  </option>
                </select>

                <span className="toolbar-line" />

                {([
                  [
                    'point',
                    '● Point'
                  ],
                  [
                    'rect',
                    '□ Rect'
                  ]
                ] as [
                  Tool,
                  string
                ][]).map(
                  ([
                    tool,
                    label
                  ]) => (
                    <button
                      className={
                        map.tool ===
                          tool
                          ? 'active-tool'
                          : ''
                      }
                      key={
                        tool
                      }
                      onClick={() =>
                        setMap(
                          current => ({
                            ...current,
                            tool:
                              current.tool ===
                                tool
                                ? null
                                : tool
                          })
                        )
                      }
                    >
                      {label}
                    </button>
                  )
                )}

                <span className="toolbar-line" />

                <button
                  onClick={() =>
                    open(
                      'Spectral Analysis'
                    )
                  }
                >
                  ◉ Spectral
                </button>

                <button
                  onClick={() =>
                    open(
                      'Change Detection'
                    )
                  }
                >
                  ↯ Change
                </button>

                <button
                  onClick={() =>
                    open(
                      'Explain Area'
                    )
                  }
                >
                  ✦ Explain
                </button>
              </div>

              <div className="workspace-switcher">
                <div className="segmented">
                  {[
                    'Layers',
                    'Insights',
                    'Features',
                    'Story'
                  ].map(
                    name => (
                      <button
                        className={
                          panel ===
                            name
                            ? 'active'
                            : ''
                        }
                        key={
                          name
                        }
                        onClick={() =>
                          setPanel(
                            name
                          )
                        }
                      >
                        {name}
                      </button>
                    )
                  )}
                </div>

                <div className="segmented view-tabs">
                  {([
                    [
                      '2d',
                      '2D GIS'
                    ],
                    [
                      'globe',
                      'Globe View'
                    ]
                  ] as [
                    MapMode,
                    string
                  ][]).map(
                    ([
                      value,
                      label
                    ]) => (
                      <button
                        className={
                          mode ===
                            value
                            ? 'active'
                            : ''
                        }
                        key={
                          value
                        }
                        onClick={() =>
                          setMode(
                            value
                          )
                        }
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {panel && (
                <div className="workspace-panel">
                  <div className="workspace-panel-head">
                    <h3>
                      {panel.toUpperCase()}
                    </h3>

                    <button
                      onClick={() =>
                        setPanel(
                          ''
                        )
                      }
                    >
                      ·
                    </button>
                  </div>

                  {panel ===
                    'Layers'
                    ? layers
                      .slice()
                      .sort(
                        (
                          a,
                          b
                        ) =>
                          a.order -
                          b.order
                      )
                      .map(
                        layer => (
                          <div
                            className="map-layer"
                            key={
                              layer.id
                            }
                          >
                            <input
                              type="checkbox"
                              checked={
                                layer.visible
                              }
                              onChange={e =>
                                patchLayer(
                                  layer.id,
                                  {
                                    visible:
                                      e
                                        .target
                                        .checked
                                  }
                                )
                              }
                            />

                            <i
                              style={{
                                background:
                                  layer.color
                              }}
                            />

                            <span>
                              {
                                layer.name
                              }

                              <small>
                                {layer.demo
                                  ? 'READY'
                                  : 'LIVE API'}
                              </small>
                            </span>
                          </div>
                        )
                      )
                    : (
                      <div className="insight">
                        <strong>
                          {
                            panel
                          }
                        </strong>

                        <p>
                          {panel ===
                            'Features'
                            ? map.point
                              ? 'Point selected · DEMO FEATURE'
                              : 'Use Point or Rect to set a shared AOI.'
                            : `Simulated ${panel.toLowerCase()} for ${chat?.title ||
                            'current workspace'
                            }.`}
                        </p>
                      </div>
                    )}
                </div>
              )}

              <div className="map-legend">
                <div className="legend-title">
                  ACTIVE LAYER
                  LEGENDS
                </div>

                <div className="legend-body">
                  {layers
                    .filter(
                      layer =>
                        layer.visible
                    )
                    .map(
                      layer => (
                        <p
                          key={
                            layer.id
                          }
                        >
                          <i
                            style={{
                              background:
                                layer.color
                            }}
                          />{' '}
                          {
                            layer.name
                          }
                        </p>
                      )
                    )}
                </div>
              </div>

              {mode !==
                'globe' && (
                  <div className="map-status">
                    {map.tool
                      ? `Drawing ${map.tool.toUpperCase()}`
                      : map.point
                        ? `POINT · ${map.point[0].toFixed(
                          4
                        )}° N, ${map.point[1].toFixed(
                          4
                        )}° E`
                        : `${map.center[0].toFixed(
                          3
                        )}° N · ${map.center[1].toFixed(
                          3
                        )}° E`}{' '}
                    ·{' '}
                    {
                      timelineDates[
                      dateIndex
                      ]
                    }{' '}
                    · DEMO DATA
                  </div>
                )}
    </>
  );
}