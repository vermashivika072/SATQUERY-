import { LoadingDots } from './LoadingDots';
import type { Chat, User } from '../types';
import type * as React from 'react';

export function LeftSidebar({
  chatCollapsed, toggleChat, domain, domainChats, chat, setActive, user,
  profile, setProfile, renamingId, renameBusy, renameDraft, setRenameDraft,
  setRenamingId, saveRenamedSession, handleDeleteSession, createChatSession,
  setChats, setCopilotError, open, setLocked, logout
}: {
  chatCollapsed: boolean;
  toggleChat: () => void;
  domain: string;
  domainChats: Chat[];
  chat?: Chat;
  setActive: (id: string) => void;
  user: User;
  profile: boolean;
  setProfile: React.Dispatch<React.SetStateAction<boolean>>;
  renamingId: string | null;
  renameBusy: boolean;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  setRenamingId: (v: string | null) => void;
  saveRenamedSession: (id: string) => void;
  handleDeleteSession: (id: string) => void;
  createChatSession: (context: string) => Promise<Chat>;
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  setCopilotError: React.Dispatch<React.SetStateAction<string | null>>;
  open: (title: string) => void;
  setLocked: React.Dispatch<React.SetStateAction<boolean>>;
  logout: () => void;
}) {
  return (
        <aside
          className={`left-sidebar workspace-dock panel-shell rounded-xl overflow-hidden ${chatCollapsed
            ? 'is-collapsed'
            : ''
            }`}
        >
          {chatCollapsed ? (
            <button
              className="chat-collapsed-tab"
              onClick={
                toggleChat
              }
              title="Expand Chat & History"
            >
              Chat
            </button>
          ) : (
            <>
              <div className="sidebar-heading">
                <span>
                  CHAT &amp;
                  HISTORY
                </span>

                <button
                  className="collapse-btn"
                  onClick={
                    toggleChat
                  }
                >
                  ·
                </button>
              </div>

              <div className="sidebar-scroll space-y-3">
                <button
                  className="new-session p-2.5"
                  onClick={async () => {
                    try {
                      const created =
                        await createChatSession(
                          domain
                        );

                      setChats(
                        items => [
                          created,
                          ...items
                        ]
                      );

                      setActive(
                        created.id
                      );

                      setCopilotError(
                        null
                      );
                    } catch (
                    e: any
                    ) {
                      setCopilotError(
                        e?.message ||
                        'Unable to create session'
                      );
                    }
                  }}
                >
                  + New Session{' '}
                  <kbd>
                    Ctrl N
                  </kbd>
                </button>

                <section className="side-section space-y-3">
                  <h3>
                    {domain.toUpperCase()}{' '}
                    HISTORY
                  </h3>

                  {domainChats.map(
                    item => (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        key={
                          item.id
                        }
                      >
                        <button
                          className={
                            chat?.id ===
                              item.id
                              ? 'history-active history-item p-2.5 bg-[#1C2530] border border-[#293442] rounded-md text-xs'
                              : 'history-item p-2.5 bg-[#1C2530] border border-[#293442] rounded-md text-xs'
                          }
                          onClick={() =>
                            setActive(
                              item.id
                            )
                          }
                        >
                          {renamingId === item.id ? (
                            renameBusy ? (
                              <LoadingDots size="sm" />
                            ) : (
                              <input
                                value={renameDraft}
                                onChange={event =>
                                  setRenameDraft(event.target.value)
                                }
                                onClick={event =>
                                  event.stopPropagation()
                                }
                                onKeyDown={event => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    saveRenamedSession(item.id);
                                  }
                                  if (event.key === 'Escape') {
                                    setRenamingId(null);
                                    setRenameDraft('');
                                  }
                                }}
                                autoFocus
                                style={{
                                  minWidth: 0,
                                  width: '100%',
                                  color: 'var(--text)',
                                  background: 'transparent',
                                  border: '1px solid var(--border)'
                                }}
                              />
                            )
                          ) : (
                            <span
                              className="history-title text-xs"
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {
                                item.title
                              }
                            </span>
                          )}

                          <small className="history-meta text-[10px]">
                            {
                              item.time
                            }
                          </small>
                        </button>

                        <button
                          onClick={event => {
                            event.stopPropagation();
                            setRenamingId(item.id);
                            setRenameDraft(item.title);
                          }}
                          aria-label="Rename session"
                        >
                          Rename
                        </button>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteSession(item.id);
                          }}
                          aria-label="Delete session"
                        >
                          ×
                        </button>
                      </div>
                    )
                  )}
                </section>

                <section className="side-section space-y-3">
                  <h3>
                    FLOATING
                    SUITES
                  </h3>

                  <button
                    className="history-item p-2.5 bg-[#1C2530] border border-[#293442] rounded-md text-xs"
                    onClick={() =>
                      open(
                        'Spatial Feature Extraction'
                      )
                    }
                  >
                    <span className="history-title text-xs">
                      ◌ Spatial
                      Extraction
                    </span>
                  </button>

                  <button
                    className="history-item p-2.5 bg-[#1C2530] border border-[#293442] rounded-md text-xs"
                    onClick={() =>
                      open(
                        'AI Insights'
                      )
                    }
                  >
                    <span className="history-title text-xs">
                      ✦ Executive
                      Insights
                    </span>
                  </button>

                  <button
                    className="history-item p-2.5 bg-[#1C2530] border border-[#293442] rounded-md text-xs"
                    onClick={() =>
                      open(
                        'Layer Laboratory'
                      )
                    }
                  >
                    <span className="history-title text-xs">
                      ▤ Layer
                      Laboratory
                    </span>
                  </button>
                </section>
              </div>

              <button
                className="profile-button"
                onClick={() =>
                  setProfile(
                    value =>
                      !value
                  )
                }
              >
                👤{' '}
                <span>
                  <b>
                    {user.username}
                  </b>
                  <small>
                    {
                      user.role
                    }
                  </small>
                </span>
              </button>

              {profile && (
                <div className="profile-pop">
                  <b>
                    {user.username}
                  </b>

                  <span>
                    {user.email}
                  </span>

                  <small>
                    {user.role} ·{' '}
                    {
                      'Active'
                    }
                  </small>

                  <hr />

                  <button
                    onClick={() =>
                      setLocked(
                        true
                      )
                    }
                  >
                    Lock Workstation
                  </button>

                  <button
                    onClick={
                      logout
                    }
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
  );
}