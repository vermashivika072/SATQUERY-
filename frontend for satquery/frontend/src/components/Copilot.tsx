import { useState } from 'react';
import { LoadingDots } from './LoadingDots';
import { ProgressIndicator } from './ProgressIndicator';
import { ProvenanceBadge } from './ProvenanceBadge';
import { refreshSession } from '../api/client';
import { getCopilotSessionId } from '../api/legacy';
import { useDock } from '../hooks/useDock';
import type { Chat } from '../types';
import type * as React from 'react';

const META_KEYS =
  'flood_risk_heuristic|parcel_mapping|weather_tracker|coordinates_source|query_type|map_navigation|scenes|vision';

const cleanReply = (
  text: unknown
): string => {
  if (typeof text !== 'string') {
    return '';
  }

  const inline = new RegExp(
    `\\b(?:${META_KEYS})\\b\\s*["']?\\s*[:=]\\s*[^,}\\n]*`,
    'gi'
  );

  return text
    .replace(inline, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
};

const uploadRagDocument = async (
  file: File,
  sessionId: string
) => {
  const form = new FormData();

  form.append('file', file);
  form.append('session_id', sessionId);

  const attempt = async () =>
    fetch(
      '/api/v1/rag/upload-doc',
      {
        method: 'POST',
        credentials: 'include',
        body: form
      }
    );

  let response = await attempt();

  if (response.status === 401) {
    const ok = await refreshSession();

    if (ok) {
      response = await attempt();
    }
  }

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({}));

    throw new Error(
      body.detail ||
      `Upload failed (${response.status})`
    );
  }

  return response.json();
};

export function Copilot({
  dock,
  chat,
  setChats,
  input,
  setInput,
  onSend,
  attachedFiles,
  setAttachedFiles,
  loading,
  error,
  setCopilotError,
  onRetry,
  fileProgress,
  setFileProgress,
  isDraggingOver,
  cacheEnabled = localStorage.getItem(
    'geoai-copilot-cache'
  ) !== 'false',
  cacheHit = false,
  onToggleCache = () => {
    localStorage.setItem(
      'geoai-copilot-cache',
      localStorage.getItem(
        'geoai-copilot-cache'
      ) === 'false'
        ? 'true'
        : 'false'
    );
  },
}: {
  dock: ReturnType<
    typeof useDock
  >;
  chat?: Chat;
  setChats: React.Dispatch<
    React.SetStateAction<Chat[]>
  >;
  input: string;
  setInput: (
    v: string
  ) => void;
  onSend: (
    value?: string
  ) => void;
  attachedFiles: File[];
  setAttachedFiles: React.Dispatch<
    React.SetStateAction<File[]>
  >;
  loading?: boolean;
  error?: string | null;
  setCopilotError: React.Dispatch<React.SetStateAction<string | null>>;
  onRetry?: () => void;
  fileProgress?: number | null;
  setFileProgress?: React.Dispatch<
    React.SetStateAction<
      number | null
    >
  >;
  isDraggingOver?: boolean;
  cacheEnabled?: boolean;
  cacheHit?: boolean;
  onToggleCache?: () => void;
}) {
  const presets = [
    'Drought NDVI',
    'River SAR Flood',
    'Cadastral Survey',
    'Urban Heat / Built-up'
  ];

  const [indexedDocs, setIndexedDocs] =
    useState<Set<string>>(
      () => new Set()
    );

  const handleDeleteMessage = async (
    index: number
  ) => {
    if (!chat) return;

    const next = (chat.messages ?? []).slice();

    if (
      next[index].role === 'user' &&
      next[index + 1]?.role === 'assistant'
    ) {
      const ok = window.confirm(
        'Delete this user message and its assistant response?'
      );

      if (!ok) return;

      next.splice(index, 2);
    } else {
      next.splice(index, 1);
    }

    setChats(
      items =>
        items.map(
          c =>
            c.id === chat.id
              ? {
                ...c,
                messages: next
              }
              : c
        )
    );
  };

  if (dock.collapsed) {
    return (
      <aside
        className="right-dock copilot-dock panel-shell rounded-xl overflow-hidden is-collapsed"
        aria-label="AI Map Copilot"
      >
        <button
          className="copilot-collapsed-tab"
          onClick={dock.toggle}
          title="Expand AI Map Copilot"
        >
          Copilot
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`right-dock copilot-dock panel-shell rounded-xl overflow-hidden ${isDraggingOver
        ? 'drag-over'
        : ''
        }`}
      aria-label="AI Map Copilot"
    >
      <section className="copilot-shell">
        <header className="copilot-shell-header">
          <strong>
            AI MAP COPILOT
          </strong>

          <span
            className={`memory-badge ${cacheHit
              ? 'cache-hit'
              : ''
              }`}
          >
            {cacheHit
              ? 'Cache Hit'
              : cacheEnabled
                ? 'Memory Active'
                : 'Memory Off'}
          </span>

          <button
            className="collapse-btn"
            onClick={dock.toggle}
            title="Collapse AI Map Copilot"
          >
            ·
          </button>
        </header>

        <div
          className="copilot-chat"
          aria-live="polite"
        >
          {(chat?.messages ?? []).map(
            (
              message,
              index
            ) => {
const llmConfigError =
                  typeof message.text ===
                    'string' &&
                  message.text.indexOf(
                    'LLM is not configured'
                  ) !== -1;

              return (
              <article
                className={
                  message.role
                }
                key={index}
              >
                <p>
                  {message.role ===
                    'assistant'
                    ? cleanReply(
                      message.text
                    )
                    : message.text}
                </p>

                {llmConfigError && (
                  <small
                    style={{
                      display: 'block',
                      color: '#dc2626',
                      marginTop: '2px'
                    }}
                  >
                    Check GROQ_API_KEY in
                    geoai backend/.env,
                    then restart the
                    backend.
                  </small>
                )}

                {message.role ===
                  'assistant' &&
                  message.provenance &&
                  Object.keys(
                    message.provenance
                  ).length > 0 && (
                    <div
                      className="provenance-badges"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        marginTop: '4px'
                      }}
                    >
                      {Object.entries(
                        message.provenance
                      ).map(
                        ([key, prov]) => {
                          const isLlmConfigError =
                            key === 'llm' &&
                            llmConfigError;
                          return (
                          <ProvenanceBadge
                            key={key}
                            label={key}
                            source={
                              isLlmConfigError
                                ? 'CONFIG_ERROR'
                                : typeof prov ===
                                    'string'
                                  ? prov
                                  : prov?.source
                            }
                          />
                          );
                        }
                      )}
                    </div>
                  )}

                <button
                  onClick={() =>
                    handleDeleteMessage(
                      index
                    )
                  }
                  aria-label="Delete message"
                >
                  ×
                </button>

                <small>
                  {message.role ===
                    'assistant'
                    ? 'SYSTEM · DEMO DATA · '
                    : ''}
                  {message.time}
                </small>
              </article>
              );
            }
          )}

          {loading && (
            <div
              style={{
                padding:
                  '8px 4px'
              }}
            >
              <LoadingDots message="Copilot is typing" />
            </div>
          )}

          {error && (
            <div
              className="alert danger"
              style={{
                margin:
                  '6px 8px',
                display: 'flex',
                alignItems:
                  'center',
                gap: '8px'
              }}
            >
              <span
                style={{
                  flex: 1
                }}
              >
                {error}
              </span>

              {onRetry && (
                <button
                  className="secondary"
                  style={{
                    height: '22px',
                    padding:
                      '0 8px',
                    fontSize:
                      '9px'
                  }}
                  onClick={
                    onRetry
                  }
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {attachedFiles.length ===
          0 ? (
          <section className="copilot-presets">
            <b>
              QUICK QUERIES
            </b>

            <div>
              {presets.map(
                text => (
                  <button
                    key={text}
                    onClick={() =>
                      onSend(text)
                    }
                  >
                    {text}
                  </button>
                )
              )}
            </div>
          </section>
        ) : (
          <div
            className="attachment-strip"
            style={{
              padding:
                '6px 8px',
              borderTop:
                '1px solid var(--border)',
              background:
                'var(--panel)',
              display: 'flex',
              flexWrap:
                'wrap',
              gap: '6px'
            }}
          >
            {attachedFiles.map(
              (
                file,
                idx
              ) => (
                <span
                  key={idx}
                  className="attached-chip"
                  style={{
                    display:
                      'inline-flex',
                    alignItems:
                      'center',
                    gap: '6px',
                    maxWidth:
                      '160px',
                    padding:
                      '4px 6px',
                    background:
                      'var(--panel2)',
                    border:
                      '1px solid var(--border)',
                    borderRadius:
                      'var(--radius-sm)',
                    fontSize:
                      '9px',
                    color:
                      'var(--text)'
                  }}
                >
                  <span
                    style={{
                      fontSize:
                        '11px'
                    }}
                  >
                    📄
                  </span>

                  <span
                    style={{
                      flex: 1,
                      overflow:
                        'hidden',
                      textOverflow:
                        'ellipsis',
                      whiteSpace:
                        'nowrap',
                      maxWidth:
                        '110px'
                    }}
                    title={
                      file.name
                    }
                  >
                    {file.name}
                  </span>

                  {indexedDocs.has(
                    file.name +
                    ':' +
                    file.size
                  ) && (
                    <span
                      style={{
                        background:
                          'rgba(22,163,74,.18)',
                        color:
                          '#16a34a',
                        border:
                          '1px solid #16a34a',
                        borderRadius:
                          '4px',
                        padding:
                          '0 4px',
                        fontSize:
                          '8px',
                        lineHeight:
                          '14px',
                        whiteSpace:
                          'nowrap'
                      }}
                    >
                      indexed
                    </span>
                  )}

                  <button
                    type="button"
                    style={{
                      background:
                        'transparent',
                      border:
                        'none',
                      cursor:
                        'pointer',
                      color:
                        'var(--muted)',
                      fontSize:
                        '12px',
                      lineHeight:
                        1,
                      padding:
                        '0 2px'
                    }}
                    onClick={() =>
                      setAttachedFiles(
                        prev =>
                          prev.filter(
                            (
                              _,
                              i
                            ) =>
                              i !==
                              idx
                          )
                      )
                    }
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </span>
              )
            )}
          </div>
        )}

        <div className="copilot-composer-wrapper">
          <div className="memory-controls">
            <label>
              <input
                type="checkbox"
                checked={
                  cacheEnabled
                }
                onChange={
                  onToggleCache
                }
              />{' '}
              Save Context /
              Cache Memory
            </label>
          </div>

          {fileProgress !==
            null &&
            fileProgress !==
            undefined && (
              <div
                style={{
                  padding:
                    '0 8px 4px'
                }}
              >
                <ProgressIndicator
                  progress={
                    fileProgress
                  }
                  message="Uploading"
                />
              </div>
            )}

          <form
            className="copilot-composer"
            onSubmit={event => {
              event.preventDefault();
              onSend();
            }}
          >
            <label
              htmlFor="file-upload"
              className="paperclip-btn"
              title="Attach files"
              style={{
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                width: '28px',
                height: '28px',
                color:
                  'var(--muted)',
                cursor:
                  'pointer',
                borderRadius:
                  'var(--radius-sm)'
              }}
            >
              <span
                style={{
                  fontSize:
                    '14px'
                }}
              >
                📎
              </span>
            </label>

            <input
              type="file"
              id="file-upload"
              multiple
              accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.jp2,.geojson,.kml"
              className="hidden"
              style={{
                display: 'none'
              }}
              onChange={e => {
                const files =
                  e.target.files
                    ? Array.from(
                      e.target
                        .files
                    )
                    : [];

                const allowed =
                  /\.(txt|md|csv|pdf|png|jpe?g|tiff?|jp2|geojson|kml)$/i;

                const valid =
                  files.filter(
                    f =>
                      allowed.test(
                        f.name
                      )
                  );

                if (valid.length) {
                  if (
                    setFileProgress
                  ) {
                    setFileProgress(
                      12
                    );

                    let _p2 =
                      12;

                    const _iv2 =
                      setInterval(
                        () => {
                          _p2 =
                            Math.min(
                              92,
                              _p2 +
                              16
                            );

                          setFileProgress(
                            _p2
                          );
                        },
                        140
                      );

                    setTimeout(
                      () => {
                        setFileProgress(
                          100
                        );

                        setTimeout(
                          () =>
                            setFileProgress(
                              null
                            ),
                          500
                        );

                        clearInterval(
                          _iv2
                        );
                      },
                      900
                    );
                  }

                  setAttachedFiles(
                    prev => {
                      const existing =
                        new Set(
                          prev.map(
                            p =>
                              p.name +
                              ':' +
                              p.size
                          )
                        );

                      const deduped =
                        valid.filter(
                          f =>
                            !existing.has(
                              f.name +
                              ':' +
                              f.size
                            )
                        );

                      return [
                        ...prev,
                        ...deduped
                      ];
                    }
                  );

                  const docFiles =
                    valid.filter(
                      f =>
                        /\.(txt|md|csv)$/i.test(
                          f.name
                        )
                    );

                  if (docFiles.length) {
                    const sessionId =
                      getCopilotSessionId();

                    (async () => {
                      for (const f of docFiles) {
                        try {
                          await uploadRagDocument(
                            f,
                            sessionId
                          );

                          setIndexedDocs(
                            prev =>
                              new Set(
                                prev
                              ).add(
                                f.name +
                                ':' +
                                f.size
                              )
                          );
                        } catch {
                          /* leave unindexed */
                        }
                      }
                    })();
                  }
                }

                e.currentTarget.value =
                  '';
              }}
            />

            <input
              value={input}
              onChange={e =>
                setInput(
                  e.target.value
                )
              }
              placeholder="Ask a spatial query…"
            />

            <button
              aria-label="Send"
              title="Send"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                background:
                  'var(--accent)',
                color: 'white',
                border:
                  '1px solid var(--accent)',
                borderRadius:
                  'var(--radius-sm)',
                cursor:
                  'pointer'
              }}
            >
              <span
                style={{
                  fontSize:
                    '12px',
                  lineHeight: 1
                }}
              >
                ↑
              </span>
            </button>
          </form>
        </div>
      </section>
    </aside>
  );
}