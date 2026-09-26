import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import '../style.css';
import './maps/map.css';
import './react.css';
import './workstation.css';
import './feedback.css';
import './workspace.css';
import './master-fixes.css';
import './security.css';
import './refinement.css';
import './components/loading.css';
import { LoadingSpinner } from './components/LoadingSpinner';
import { LoadingDots } from './components/LoadingDots';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { useAsyncState } from './hooks/useAsyncState';
import {
  AUTH_EXPIRED_EVENT,
  authApi,
  jobsApi,
  refreshSession,
  type Job
} from './api/client';
import {
  CompareMapPair,
  LayerModel,
  MapEngine,
  MapMarker,
  MapMode,
  MapRefApi,
  MapState
} from './maps/MapWorkspace';
import {
  AnalysisWindow
} from './components/AnalysisWindow';
import {
  CompareDialog
} from './components/CompareDialog';
import {
  Copilot
} from './components/Copilot';
import {
  LeftSidebar
} from './components/LeftSidebar';
import {
  Login
} from './components/Login';
import {
  MapToolbar
} from './components/MapToolbar';
import {
  ProvenanceBadge
} from './components/ProvenanceBadge';
import {
  Timeline
} from './components/Timeline';
import {
  api,
  getCopilotSessionId,
  uid
} from './api/legacy';
import {
  getWorkspaceRect
} from './lib/workspace';
import {
  baseLayers,
  domainDefaultLayers,
  domains,
  timelineDates,
  titleToType,
  WINDOW_DEFS
} from './lib/constants';
import type {
  Chat,
  GeoFeatureCollection,
  Message,
  Note,
  User,
  Win,
  WindowType
} from './types';


/*
 * FIX:
 * Explicitly create Message objects so TypeScript does not infer
 * role as a generic string.
 */
const createMessage = (
  role: Message['role'],
  text: string,
  time = 'Now',
  rag_sources?: Message['rag_sources'],
  provenance?: Message['provenance']
): Message => ({
  role,
  text,
  time,
  ...(rag_sources ? { rag_sources } : {}),
  ...(provenance ? { provenance } : {})
});



const COPILOT_INPUT_PLACEHOLDER =
  'Ask Copilot... (e.g., Assess risk near Ranchi)';

if (typeof document !== 'undefined') {
  const applyCopilotPlaceholder = () => {
    const input =
      document.querySelector<HTMLInputElement>(
        '.copilot-composer input:not([type="file"])'
      );

    if (!input) return false;

    input.placeholder = COPILOT_INPUT_PLACEHOLDER;
    return true;
  };

  const placeholderObserver = new MutationObserver(() => {
    if (applyCopilotPlaceholder()) {
      placeholderObserver.disconnect();
    }
  });

  if (
    !applyCopilotPlaceholder() &&
    document.body
  ) {
    placeholderObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}




const appendUserMessage = async (
  chatId: string,
  text: string
) =>
  api(
    `/chats/${chatId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        role: 'user',
        text
      })
    }
  );

const appendAssistantMessage = async (
  chatId: string,
  text: string
) =>
  api(
    `/chats/${chatId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        role: 'assistant',
        text
      })
    }
  );

const copilotQuery = async (
  sessionId: string,
  message: string,
  assetId: string | null = null,
  mapCenter: {
    lat: number;
    lon: number;
    zoom: number;
  } | null = null
) =>
  api(
    '/copilot/query',
    {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        prompt: message,
        asset_id: assetId,
        enable_cache: true,
        map_context: mapCenter
          ? {
            lat: mapCenter.lat,
            lon: mapCenter.lon,
            zoom: mapCenter.zoom
          }
          : null
      })
    }
  );

const createChatSession = async (
  context: string
) => {
  const data = await api(
    '/chats',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'New Spatial Session',
        context
      })
    }
  );

  return {
    ...data,
    messages: Array.isArray(data.messages)
      ? data.messages
      : []
  } as Chat;
};

const getCurrentWeather = async (
  lat: number,
  lon: number
) =>
  api(
    `/weather/current?lat=${lat}&lon=${lon}`
  );


const getCachePreference = () => {
  try {
    return (
      localStorage.getItem(
        'geoai-copilot-cache'
      ) !== 'false'
    );
  } catch {
    return true;
  }
};

const uploadGeoAIFile = async (
  file: File
) => {
  const form = new FormData();

  form.append('file', file);

  const attempt = async () =>
    fetch(
      '/api/v1/assets/upload',
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



const agentCoordinates = (
  data: any
): [number, number] | null => {
  if (
    data?.map_navigation &&
    data.map_navigation.should_navigate === false
  ) {
    return null;
  }

  const coordinates =
    data?.data?.weather_tracker
      ?.coordinates;

  const lat = Number(
    coordinates?.lat
  );

  const lon = Number(
    coordinates?.lon
  );

  return Number.isFinite(lat) &&
    Number.isFinite(lon)
    ? [lat, lon]
    : null;
};

const agentDomain = (
  data: any
) => {
  const hazard = String(
    data?.data?.weather_tracker
      ?.hazard_type || ''
  ).toLowerCase();

  if (
    [
      'flood',
      'cyclone',
      'landslide',
      'wildfire'
    ].includes(hazard)
  ) {
    return 'Disaster Intelligence';
  }

  if (hazard.includes('urban')) {
    return 'Urban Parcel';
  }

  if (hazard.includes('weather')) {
    return 'Weather Intelligence';
  }

  return 'Satellite / AI';
};

const agentLayerIds = (
  data: any
) => {
  const hazard = String(
    data?.data?.weather_tracker
      ?.hazard_type || ''
  ).toLowerCase();

  const ids = new Set([
    's2',
    'ndvi'
  ]);

  if (data?.data?.parcel_mapping) {
    ids.add('parcel');
  }

  if (
    data?.data?.flood_risk_heuristic ||
    hazard.includes('flood')
  ) {
    ids.add('flood');
  }

  if (
    hazard.includes('cyclone') ||
    hazard.includes('weather')
  ) {
    ids.add('weather');
  }

  return [...ids];
};

const pointInRing = (
  ring: number[][],
  x: number,
  y: number
) => {
  let inside = false;

  for (
    let i = 0,
      j = ring.length - 1;

    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (
      yi > y !== yj > y &&
      x <
      ((xj - xi) * (y - yi)) /
      (yj - yi) +
      xi
    ) {
      inside = !inside;
    }
  }

  return inside;
};

const polyContains = (
  geometry: any,
  center: [number, number]
) => {
  if (!geometry) return false;

  const rings: any = geometry
    ?.coordinates;
  const ring = rings?.[0];

  if (
    !Array.isArray(ring) ||
    ring.length < 3
  ) {
    return false;
  }

  return pointInRing(
    ring,
    center[1],
    center[0]
  );
};



function Lock({
  theme,
  onUnlock,
  onLogout
}: {
  theme: string;
  onUnlock: () => void;
  onLogout: () => void;
}) {
  const [
    password,
    setPassword
  ] = useState('');

  const [
    error,
    setError
  ] = useState('');

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    onUnlock();
  };

  return (
    <div
      className={`lock-overlay theme-${theme}`}
    >
      <section className="auth-card lock-card">
        <p className="auth-eyebrow">
          SECURE SESSION
        </p>

        <h1>
          Workstation locked
        </h1>

        <p className="auth-sub">
          Your map, AOI, chat, timeline and
          windows are preserved.
        </p>

        <form onSubmit={submit}>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e =>
                setPassword(
                  e.target.value
                )
              }
              autoFocus
            />
          </label>

          {error && (
            <p className="auth-error">
              {error}
            </p>
          )}

          <button className="auth-submit">
            UNLOCK WORKSPACE
          </button>
        </form>

        <button
          className="auth-secondary"
          onClick={onLogout}
        >
          Switch account / sign out
        </button>
      </section>
    </div>
  );
}




function App() {
  const [
    theme,
    setTheme
  ] = useState(
    localStorage.getItem(
      'geoai-theme'
    ) || 'dark'
  );

  const [
    user,
    setUser
  ] = useState<User | null>(
    null
  );

  const [
    locked,
    setLocked
  ] = useState(false);

  const [
    domain,
    setDomain
  ] = useState(domains[0]);

  const [
    mode,
    setMode
  ] = useState<MapMode>('2d');

  const [
    panel,
    setPanel
  ] = useState('Layers');

  const [
    chats,
    setChats
  ] = useState<Chat[]>([]);

  const [
    active,
    setActive
  ] = useState('');

  const [
    layers,
    setLayers
  ] = useState(baseLayers);

  const [
    map,
    setMap
  ] = useState<MapState>({
    center: [
      20.5937,
      78.9629
    ],
    zoom: 9,
    aoi: [
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
    ],
    tool: null,
    basemap:
      'OSM Standard'
  });

  const [
    activeMarkers,
    setActiveMarkers
  ] = useState<MapMarker[]>([]);

  const [
    wins,
    setWins
  ] = useState<Win[]>(() => {
    try {
      const raw =
        JSON.parse(
          localStorage.getItem(
            'geoai-windows-react'
          ) || '[]'
        );

      if (!Array.isArray(raw)) {
        return [];
      }

      return raw.map(
        (
          w: any,
          idx: number
        ) => {
          const type =
            w.type ||
            titleToType(
              w.title ||
              'Mission'
            );

          const def =
            WINDOW_DEFS.find(
              d =>
                d.type ===
                type
            ) ||
            WINDOW_DEFS[
            idx %
            WINDOW_DEFS.length
            ];

          return {
            id:
              w.id ||
              uid(),

            title:
              w.title ||
              def.title,

            type,

            x:
              typeof w.x ===
                'number'
                ? w.x
                : 32 +
                (idx *
                  32) %
                200,

            y:
              typeof w.y ===
                'number'
                ? w.y
                : 32 +
                (idx *
                  28) %
                160,

            width:
              typeof w.width ===
                'number'
                ? Math.max(
                  300,
                  w.width
                )
                : 400,

            height:
              typeof w.height ===
                'number'
                ? Math.max(
                  180,
                  w.height
                )
                : 300,

            zIndex:
              typeof w.zIndex ===
                'number'
                ? w.zIndex
                : typeof w.z ===
                  'number'
                  ? w.z
                  : 20 +
                  idx,

            hidden:
              typeof w.hidden ===
                'boolean'
                ? w.hidden
                : w.minimized ===
                  true
                  ? true
                  : false
          } as Win;
        }
      );
    } catch {
      return [];
    }
  });

  const [
    z,
    setZ
  ] = useState(() => {
    try {
      const raw =
        JSON.parse(
          localStorage.getItem(
            'geoai-windows-react'
          ) || '[]'
        );

      return Math.max(
        20,
        ...raw.map(
          (w: any) =>
            w.zIndex ||
            w.z ||
            20
        ),
        20
      );
    } catch {
      return 20;
    }
  });

  const [
    dateIndex,
    setDateIndex
  ] = useState(5);

  const [
    playing,
    setPlaying
  ] = useState(false);

  const [
    speed,
    setSpeed
  ] = useState(1);

  const [
    profile,
    setProfile
  ] = useState(false);

  const [
    notes,
    setNotes
  ] = useState<Note[]>([]);

  const [
    notesOpen,
    setNotesOpen
  ] = useState(false);

  const [
    input,
    setInput
  ] = useState('');

  const [
    search,
    setSearch
  ] = useState('');

  const [
    menu,
    setMenu
  ] = useState<string | null>(
    null
  );

  const [
    timeline,
    setTimeline
  ] = useState(true);

  const [
    comparison,
    setComparison
  ] = useState({
    open: false,
    active: false,
    from: timelineDates[4],
    to: timelineDates[8]
  });

  const [
    isCompareMode,
    setIsCompareMode
  ] = useState(false);

  const lastOverlayToggle = useRef<
    'flood' | 'ndvi'
  >(
    layers.some(
      current =>
        current.id ===
        'flood' &&
        current.visible
    )
      ? 'flood'
      : layers.some(
          current =>
            current.id ===
            'ndvi' &&
            current.visible
        )
        ? 'ndvi'
        : 'flood'
  );

  const compareLeftLayers = useMemo(
    () =>
      layers.map(current => ({
        ...current,
        visible: current.id === 's2'
      })),
    [layers, isCompareMode,
      lastOverlayToggle.current]
  );

  const compareRightLayers = useMemo(
    () =>
      layers.map(current => ({
        ...current,
        visible:
          current.id ===
          lastOverlayToggle.current
      })),
    [layers, isCompareMode,
      lastOverlayToggle.current]
  );

  useEffect(() => {
    if (!isCompareMode) return;

    const timer = setTimeout(
      () =>
        mapRef.current?.invalidateSize?.(),
      150
    );

    return () =>
      clearTimeout(timer);
  }, [isCompareMode]);

  const [
    timelineHover,
    setTimelineHover
  ] = useState(false);

  const [
    hoveredIndex,
    setHoveredIndex
  ] = useState(5);

  const [
    timelineTooltipPosition,
    setTimelineTooltipPosition
  ] = useState(50);

  const [
    attachedFiles,
    setAttachedFiles
  ] = useState<File[]>([]);

  const [
    isDraggingOver,
    setIsDraggingOver
  ] = useState(false);

  const [
    copilotLoading,
    setCopilotLoading
  ] = useState(false);

  const [
    activeAssetIds,
    setActiveAssetIds
  ] = useState<string[]>([]);

  const [
    activeJobs,
    setActiveJobs
  ] = useState<Record<string, Job>>({});

  useEffect(() => {
    const pending = Object
      .values(activeJobs)
      .filter(job => (
        job.status === 'pending' ||
        job.status === 'running'
      ));

    if (!pending.length) return;

    const timer = window.setInterval(async () => {
      const next: Record<string, Job> = {
        ...activeJobs
      };
      let changed = false;

      for (const job of pending) {
        try {
          const fresh = await jobsApi.get(job.job_id);

          if (!fresh) continue;

          if (
            fresh.status !== next[job.job_id]?.status ||
            fresh.progress !== next[job.job_id]?.progress
          ) {
            next[job.job_id] = fresh;
            changed = true;
          }
        } catch {
          // keep polling; server may be mid-restart
        }
      }

      if (changed) setActiveJobs(next);

      const now = Date.now();
      let pruned = false;
      const stale = Object.entries(next).filter(
        ([, value]) =>
          (value.status === 'succeeded' ||
            value.status === 'failed') &&
          new Date(
            value.updated_at
          ).getTime() <
            now - 15000
      );

      if (stale.length) {
        stale.forEach(([id]) => {
          delete next[id];
        });
        pruned = true;
      }

      if (pruned) setActiveJobs(next);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeJobs]);

  const [
    copilotError,
    setCopilotError
  ] = useState<string | null>(
    null
  );

  const [
    renamingId,
    setRenamingId
  ] = useState<string | null>(null);

  const [
    renameDraft,
    setRenameDraft
  ] = useState('');

  const [
    renameBusy,
    setRenameBusy
  ] = useState(false);

  const [
    searchLoading,
    setSearchLoading
  ] = useState(false);

  const [
    searchError,
    setSearchError
  ] = useState<string | null>(
    null
  );

  const [
    mapLoading,
    setMapLoading
  ] = useState(false);

  const [
    timelineLoading,
    setTimelineLoading
  ] = useState(false);

  const [
    fileProgress,
    setFileProgress
  ] = useState<number | null>(
    null
  );

  const [
    windowLoading,
    setWindowLoading
  ] = useState<
    Record<string, boolean>
  >({});

  const [
    windowError,
    setWindowError
  ] = useState<
    Record<
      string,
      string | null
    >
  >({});

  const [
    compareStage,
    setCompareStage
  ] = useState(0);

  const [
    compareError,
    setCompareError
  ] = useState<string | null>(
    null
  );

  const [
    reportStage,
    setReportStage
  ] = useState(0);

  const [
    reportError,
    setReportError
  ] = useState<string | null>(
    null
  );

  const [
    appBootLoading,
    setAppBootLoading
  ] = useState(true);

  const [
    sessionRestoring,
    setSessionRestoring
  ] = useState(true);

  const searchAsync =
    useAsyncState(
      async (q: string) => {
        await new Promise(
          r =>
            setTimeout(
              r,
              400
            )
        );

        return q;
      },
      null
    );

  const [
    chatWidth,
    setChatWidth
  ] = useState(250);

  const [
    chatPrevWidth,
    setChatPrevWidth
  ] = useState(250);

  const [
    chatCollapsed,
    setChatCollapsed
  ] = useState(false);

  const [
    copilotWidth,
    setCopilotWidth
  ] = useState(310);

  const [
    copilotPrevWidth,
    setCopilotPrevWidth
  ] = useState(310);

  const [
    copilotCollapsed,
    setCopilotCollapsed
  ] = useState(false);

  const [
    cacheEnabled,
    setCacheEnabled
  ] = useState(
    getCachePreference
  );

  const [
    cacheHit,
    setCacheHit
  ] = useState(false);

  const [
    telemetry,
    setTelemetry
  ] = useState<{
    riskLevel: string | null;
    riskScore: number | null;
    parcelCount: number | null;
    bboxAreaKm2: number;
    weather: any | null;
    parcelSource: string | null;
    floodSource: string | null;
  }>({
    riskLevel: null,
    riskScore: null,
    parcelCount: null,
    bboxAreaKm2:
      Math.PI *
      Math.pow(
        1000 / 1000,
        2
      ),
    weather: null,
    parcelSource: null,
    floodSource: null
  });

  const [
    mapOverlay,
    setMapOverlay
  ] =
    useState<GeoFeatureCollection | null>(
      null
    );

  const [
    selectedParcel,
    setSelectedParcel
  ] = useState<{
    id: string;
    area: number | null;
    landUse: string | null;
  } | null>(null);

  const overlayFetchedRef =
    useRef<
      Record<
        string,
        string | undefined
      >
    >({});

  const chatResize = (
    e: React.PointerEvent
  ) => {
    e.preventDefault();

    const s = e.clientX;
    const init = chatWidth;

    const move = (
      ev: PointerEvent
    ) => {
      const w = Math.max(
        190,
        Math.min(
          440,
          init +
          ev.clientX -
          s
        )
      );

      setChatWidth(w);
      setChatPrevWidth(w);
    };

    const up = () =>
      window.removeEventListener(
        'pointermove',
        move
      );

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

  const copilotResize = (
    e: React.PointerEvent
  ) => {
    e.preventDefault();

    const s = e.clientX;
    const init = copilotWidth;

    const move = (
      ev: PointerEvent
    ) => {
      const w = Math.max(
        190,
        Math.min(
          440,
          init -
          ev.clientX +
          s
        )
      );

      setCopilotWidth(w);
      setCopilotPrevWidth(w);
    };

    const up = () =>
      window.removeEventListener(
        'pointermove',
        move
      );

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

  const toggleChat = () => {
    if (chatCollapsed) {
      setChatWidth(
        chatPrevWidth
      );
      setChatCollapsed(false);
    } else {
      setChatPrevWidth(
        chatWidth
      );
      setChatCollapsed(true);
    }
  };

  const toggleCopilot = () => {
    if (copilotCollapsed) {
      setCopilotWidth(
        copilotPrevWidth
      );
      setCopilotCollapsed(
        false
      );
    } else {
      setCopilotPrevWidth(
        copilotWidth
      );
      setCopilotCollapsed(
        true
      );
    }
  };

  const leftDock = {
    width: chatWidth,
    collapsed: chatCollapsed,
    resize: chatResize,
    toggle: toggleChat
  } as any;

  const rightDock = {
    width: copilotWidth,
    collapsed: copilotCollapsed,
    resize: copilotResize,
    toggle: toggleCopilot
  } as any;

  const idle =
    useRef<
      number | undefined
    >(undefined);

  const mapRef =
    useRef<MapRefApi | null>(null);

  const menuRefs =
    useRef<
      Record<
        string,
        HTMLButtonElement | null
      >
    >({});

  const notifBtnRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const [
    menuPos,
    setMenuPos
  ] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const [
    notifPos,
    setNotifPos
  ] = useState<{
    left: number;
    top: number;
    right: number;
  } | null>(null);

  const domainChats =
    useMemo(
      () =>
        chats.filter(
          chat =>
            chat.context ===
            domain
        ),
      [chats, domain]
    );

  const chat =
    useMemo(
      () =>
        domainChats.find(
          item =>
            item.id ===
            active
        ) ||
        domainChats[0],
      [
        domainChats,
        active
      ]
    );

  useEffect(() => {
    localStorage.setItem(
      'geoai-theme',
      theme
    );

    document.documentElement.classList.toggle(
      'theme-bright',
      theme === 'bright'
    );

    document.documentElement.classList.toggle(
      'theme-dark',
      theme === 'dark'
    );
  }, [theme]);

  useEffect(() => {
    const onCacheChange = (
      event: Event
    ) => {
      const target =
        event.target as HTMLInputElement;

      if (
        target?.type ===
        'checkbox' &&
        target.closest(
          '.memory-controls'
        )
      ) {
        setCacheEnabled(
          target.checked
        );

        try {
          localStorage.setItem(
            'geoai-copilot-cache',
            String(
              target.checked
            )
          );
        } catch { }
      }
    };

    document.addEventListener(
      'change',
      onCacheChange
    );

    return () => {
      document.removeEventListener(
        'change',
        onCacheChange
      );
    };
  }, []);

  useEffect(() => {
    const tm = setTimeout(
      () =>
        setAppBootLoading(
          false
        ),
      900
    );

    return () =>
      clearTimeout(tm);
  }, []);

  useEffect(() => {
    if (!user) return;

    setSessionRestoring(
      true
    );

    const tm = setTimeout(
      () =>
        setSessionRestoring(
          false
        ),
      700
    );

    return () =>
      clearTimeout(tm);
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem(
      'geoai-windows-react',
      JSON.stringify(wins)
    );
  }, [wins]);

  useEffect(() => {
    authApi.me()
      .then((userData) => {
        if (userData) {
          setUser(userData as User);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setLocked(false);
      setChats([]);
    };

    window.addEventListener(
      AUTH_EXPIRED_EVENT,
      onAuthExpired
    );

    return () =>
      window.removeEventListener(
        AUTH_EXPIRED_EVENT,
        onAuthExpired
      );
  }, []);

  useEffect(() => {
    if (!user) return;

    setNotes([]);

    api('/chats')
      .then(data => {
        const list = Array.isArray(data)
          ? data
          : [];

        setChats(
          list.map((c: any) => ({
            ...c,
            messages: Array.isArray(
              c.messages
            )
              ? c.messages
              : []
          }))
        );
      });
  }, [user?.id]);

  useEffect(() => {
    if (
      chat &&
      chat.id !== active
    ) {
      setActive(chat.id);
    }
  }, [chat?.id]);

  useEffect(() => {
    if (!playing) return;

    const timer =
      window.setInterval(
        () =>
          setDateIndex(
            index =>
              index >=
                timelineDates.length -
                1
                ? 0
                : index + 1
          ),
        1000 / speed
      );

    return () =>
      clearInterval(timer);
  }, [playing, speed]);

  useLayoutEffect(() => {
    const updater = () => {
      if (menu) {
        const menuButton = menuRefs.current[menu];

        if (!menuButton) {
          setMenuPos(null);
          return;
        }

        const rect = menuButton.getBoundingClientRect();
        setMenuPos({
          left: rect.left,
          top: rect.bottom + 6
        });
      } else {
        setMenuPos(null);
      }

      if (notesOpen) {
        const notificationButton = notifBtnRef.current;

        if (!notificationButton) {
          setNotifPos(null);
        } else {
          const rect = notificationButton.getBoundingClientRect();
          setNotifPos({
            left: rect.left,
            top: rect.bottom + 8,
            right: window.innerWidth - rect.right
          });
        }
      } else {
        setNotifPos(null);
      }
    };

    updater();
    window.addEventListener('resize', updater);
    window.addEventListener('scroll', updater, true);

    return () => {
      window.removeEventListener('resize', updater);
      window.removeEventListener('scroll', updater, true);
    };
  }, [menu, notesOpen]);

  useEffect(() => {
    if (!user || locked) return;

    const reset = () => {
      window.clearTimeout(
        idle.current
      );

      idle.current =
        window.setTimeout(
          () => {
            setLocked(true);
          },
          Number(
            import.meta.env
              .VITE_IDLE_TIMEOUT_MS ||
            300000
          )
        );
    };

    [
      'pointermove',
      'pointerdown',
      'keydown'
    ].forEach(name =>
      window.addEventListener(
        name,
        reset
      )
    );

    reset();

    return () => {
      window.clearTimeout(
        idle.current
      );

      [
        'pointermove',
        'pointerdown',
        'keydown'
      ].forEach(name =>
        window.removeEventListener(
          name,
          reset
        )
      );
    };
  }, [user, locked]);

  useEffect(() => {
    const raf =
      requestAnimationFrame(
        () => {
          mapRef.current?.invalidateSize?.();
          mapRef.current?.resize?.();
        }
      );

    const t = setTimeout(
      () => {
        mapRef.current?.invalidateSize?.();
        mapRef.current?.resize?.();
      },
      100
    );

    return () => {
      cancelAnimationFrame(
        raf
      );
      clearTimeout(t);
    };
  }, [
    chatCollapsed,
    copilotCollapsed,
    chatWidth,
    copilotWidth
  ]);

  useEffect(() => {
    const rect =
      getWorkspaceRect();

    if (!rect) return;

    setWins(items =>
      items.map(
        clampToWorkspace
      )
    );
  }, [
    chatCollapsed,
    copilotCollapsed,
    chatWidth,
    copilotWidth,
    timeline
  ]);

  useEffect(() => {
    setTimelineLoading(
      true
    );

    const tm = setTimeout(
      () =>
        setTimelineLoading(
          false
        ),
      500
    );

    return () =>
      clearTimeout(tm);
  }, [dateIndex]);

  const patchLayer = (
    id: string,
    value: Partial<LayerModel>,
    force = false
  ) => {
    if (mapLoading && !force) return;

    if (
      value.visible &&
      (id === 'flood' ||
        id === 'ndvi')
    ) {
      lastOverlayToggle.current = id;
    }

    setMapLoading(true);

    setTimeout(
      () =>
        setMapLoading(false),
      650
    );

    setLayers(items =>
      items.map(item =>
        item.id === id
          ? {
            ...item,
            ...value
          }
          : item
      )
    );
  };

  const applyMapAction = (
    response: {
      map_action?: string;
      lat?: number | null;
      lon?: number | null;
      layer_name?: string | null;
    }
  ) => {
    const action = response?.map_action;

    if (action === 'FLY_TO') {
      const lat = Number(response?.lat);
      const lon = Number(response?.lon);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        mapRef.current?.flyTo?.(
          [lat, lon],
          12,
          { duration: 1.2 }
        );
      }

      return;
    }

    const showIds: Record<
      string,
      string
    > = {
      SHOW_PARCELS: 'parcel',
      SHOW_FLOOD: 'flood',
      SHOW_WEATHER: 'weather'
    };

    const showId = action
      ? showIds[action]
      : undefined;

    if (
      showId &&
      layers.some(
        l => l.id === showId
      )
    ) {
      patchLayer(showId, {
        visible: true
      }, true);

      const lat = Number(response?.lat);
      const lon = Number(response?.lon);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        mapRef.current?.flyTo?.(
          [lat, lon],
          12,
          { duration: 1.2 }
        );
      }

      return;
    }

    if (action === 'TOGGLE_LAYER') {
      const layer = String(
        response?.layer_name || ''
      ).toLowerCase();

      const id =
        layer === 'ndvi'
          ? 'ndvi'
          : layer === 'flood'
            ? 'flood'
            : layer === 'weather'
              ? 'weather'
              : null;

      if (!id) return;

      const visible =
        layers.find(
          item =>
            item.id === id
        )?.visible ?? false;

      patchLayer(id, {
        visible: !visible
      });
    }
  };

  const handleOverlayFeatureClick = (
    feature: any
  ) => {
    const props =
      feature?.properties ?? {};
    const kind = String(
      props.overlay_layer ||
      props.hazard_layer ||
      ''
    ).toLowerCase();

    if (kind !== 'parcel') return;

    setSelectedParcel({
      id: String(
        props.parcel_id ||
        props.id ||
        'Parcel'
      ),
      area: Number.isFinite(
        Number(props.area_sqm)
      )
        ? Number(props.area_sqm)
        : null,
      landUse: String(
        props.land_use ||
        'Residential'
      )
    });
  };

  useEffect(() => {
    const center = map.center;

    if (
      !center ||
      center.length < 2
    ) {
      return;
    }

    const lat = center[0];
    const lon = center[1];
    const key0 =
      `${lat.toFixed(5)},${lon.toFixed(5)}`;

    const overlayIds = [
      'parcel',
      'flood',
      'weather'
    ] as const;

    const fetchFor = (
      id: (typeof overlayIds)[number],
      url: string,
      onData?: (payload: any) => void
    ) => {
      const visible =
        layers.find(
          l => l.id === id
        )?.visible ?? false;

      const cached =
        overlayFetchedRef.current[
        id
        ];

      if (
        visible &&
        cached !== key0
      ) {
        overlayFetchedRef.current[
          id
        ] = key0;

        (async () => {
          try {
            const payload =
              await api(url);
            const features =
              payload?.features ?? [];

            setMapOverlay(prev => {
              const baseline = (
                prev?.features ?? []
              ).filter(f =>
                String(
                  f?.properties
                    ?.overlay_layer ||
                  f?.properties
                    ?.hazard_layer ||
                  ''
                ).toLowerCase() !==
                id
              );

              return {
                type:
                  'FeatureCollection',
                features: [
                  ...baseline,
                  ...features
                ]
              };
            });

            onData?.(payload);
          } catch (error) {
            console.error(
              '[overlay]',
              id,
              error
            );
          }
        })();
      } else if (
        !visible &&
        cached
      ) {
        overlayFetchedRef.current[
          id
        ] = undefined;

        setMapOverlay(prev =>
          prev
            ? {
              ...prev,
              features: prev.features.filter(
                f =>
                  String(
                    f?.properties
                      ?.overlay_layer ||
                    f?.properties
                      ?.hazard_layer ||
                    ''
                  ).toLowerCase() !==
                  id
              )
            }
            : prev
        );
      }
    };

    fetchFor(
      'parcel',
      `/parcels?lat=${lat}&lon=${lon}&radius_meters=1000`
    );

    fetchFor(
      'flood',
      `/disaster/flood-risk?lat=${lat}&lon=${lon}`,
      payload => {
        const inside = (
          payload?.features ?? []
        ).some((f: any) =>
          polyContains(
            f?.geometry,
            center
          )
        );

        if (inside) {
          setTelemetry(
            current => ({
              ...current,
              riskLevel: 'High Risk',
              riskScore: 78.5
            })
          );
        }
      }
    );

    fetchFor(
      'weather',
      `/weather?lat=${lat}&lon=${lon}`,
      payload => {
        if (payload?.status === 'ok') {
          setTelemetry(current => ({
            ...current,
            weather: payload
          }));
        }
      }
    );
  }, [map.center, layers]);

  const patchWindow = (
    id: string,
    value: Partial<Win>
  ) =>
    setWins(items =>
      items.map(item =>
        item.id === id
          ? {
            ...item,
            ...value
          }
          : item
      )
    );

  const focusWindow = (
    id: string
  ) => {
    setZ(v => v + 1);

    patchWindow(id, {
      zIndex: z + 1
    });
  };

  const selectDomain = (
    next: string
  ) => {
    setDomain(next);

    setLayers(items =>
      items.map(layer => ({
        ...layer,
        visible: (
          domainDefaultLayers[
          next
          ] || []
        ).includes(
          layer.id
        )
      }))
    );

    const first = chats.find(
      item =>
        item.context ===
        next
    );

    if (first) {
      setActive(first.id);
    }
  };

  const clampToWorkspace = (
    w: Win
  ): Win => {
    const rect =
      getWorkspaceRect();

    if (!rect) return w;

    const maxW = rect.width;
    const maxH = rect.height;

    const width = Math.max(
      300,
      Math.min(
        w.width,
        maxW
      )
    );

    const height = Math.max(
      180,
      Math.min(
        w.height,
        maxH
      )
    );

    const x = Math.max(
      0,
      Math.min(
        w.x,
        maxW - width
      )
    );

    const y = Math.max(
      0,
      Math.min(
        w.y,
        maxH - height
      )
    );

    return {
      ...w,
      width,
      height,
      x,
      y
    };
  };

  const open = (
    titleOrType: string
  ) => {
    const type =
      WINDOW_DEFS.some(
        d =>
          d.type ===
          titleOrType
      )
        ? (titleOrType as WindowType)
        : titleToType(
          titleOrType
        );

    const def =
      WINDOW_DEFS.find(
        d =>
          d.type ===
          type
      ) ||
      WINDOW_DEFS[0];

    const existing =
      wins.find(
        w =>
          w.type ===
          type
      );

    if (existing) {
      if (existing.hidden) {
        setZ(v => v + 1);

        patchWindow(
          existing.id,
          {
            hidden: false,
            zIndex: z + 1
          }
        );
      } else {
        focusWindow(
          existing.id
        );
      }

      return;
    }

    const rect =
      getWorkspaceRect();

    const bw = rect
      ? rect.width
      : 800;

    const bh = rect
      ? rect.height
      : 600;

    const visibleCount =
      wins.filter(
        w => !w.hidden
      ).length;

    const offset =
      visibleCount;

    const cascadeX = 32;
    const cascadeY = 28;

    const w = 400;
    const h = 300;

    const x = Math.max(
      0,
      Math.min(
        32 +
        offset *
        cascadeX,
        Math.max(
          0,
          bw - w - 8
        )
      )
    );

    const y = Math.max(
      0,
      Math.min(
        32 +
        offset *
        cascadeY,
        Math.max(
          0,
          bh - h - 8
        )
      )
    );

    setZ(v => v + 1);

    const nw: Win = {
      id: uid(),
      title: def.title,
      type: def.type,
      x,
      y,
      width: w,
      height: h,
      zIndex: z + 1,
      hidden: false
    };

    if (
      windowLoading[
      def.type
      ]
    ) {
      return;
    }

    setWindowLoading(
      prev => ({
        ...prev,
        [def.type]: true
      })
    );

    setWindowError(
      prev => ({
        ...prev,
        [def.type]: null
      })
    );

    setWins(items => [
      ...items,
      clampToWorkspace(nw)
    ]);

    setTimeout(
      () =>
        setWindowLoading(
          prev => ({
            ...prev,
            [def.type]: false
          })
        ),
      650
    );
  };

  const openType = (
    type: WindowType
  ) => open(type);

  const arrange = (
    kind:
      | 'cascade'
      | 'h'
      | 'v'
      | 'min'
      | 'reset'
  ) => {
    const rect =
      getWorkspaceRect();

    const bw = rect
      ? rect.width
      : 800;

    const bh = rect
      ? rect.height
      : 500;

    if (kind === 'reset') {
      const resetWins =
        WINDOW_DEFS.map(
          (
            def,
            idx
          ) =>
          ({
            id: uid(),
            title: def.title,
            type: def.type,
            x:
              32 +
              idx * 32,
            y:
              32 +
              idx * 28,
            width: 400,
            height: 300,
            zIndex:
              20 + idx,
            hidden: false
          } as Win)
        );

      setZ(
        20 +
        resetWins.length
      );

      setWins(
        resetWins.map(
          clampToWorkspace
        )
      );

      return;
    }

    if (kind === 'min') {
      setWins(items =>
        items.map(w => ({
          ...w,
          hidden: true
        }))
      );

      return;
    }

    if (kind === 'cascade') {
      setWins(items =>
        items.map(
          (w, i) =>
            clampToWorkspace({
              ...w,
              hidden: false,
              x:
                32 +
                i * 32,
              y:
                32 +
                i * 28,
              width: 400,
              height: 300
            })
        )
      );

      setZ(
        v => v + wins.length
      );

      return;
    }

    const visible =
      wins.filter(
        w => !w.hidden
      );

    if (visible.length === 0) {
      return;
    }

    if (kind === 'h') {
      const h = Math.max(
        180,
        bh /
        visible.length -
        4
      );

      setWins(items => {
        let idx = 0;

        return items.map(
          w => {
            if (w.hidden) {
              return w;
            }

            const nw = {
              ...w,
              x: 4,
              y:
                4 +
                idx * h,
              width:
                Math.max(
                  300,
                  bw - 8
                ),
              height:
                h - 4,
              hidden: false
            } as Win;

            idx++;

            return clampToWorkspace(
              nw
            );
          }
        );
      });
    } else if (
      kind === 'v'
    ) {
      const w = Math.max(
        300,
        bw /
        visible.length -
        4
      );

      setWins(items => {
        let idx = 0;

        return items.map(
          win => {
            if (win.hidden) {
              return win;
            }

            const nw = {
              ...win,
              x:
                4 +
                idx * w,
              y: 4,
              width:
                w - 4,
              height:
                Math.max(
                  180,
                  bh - 8
                ),
              hidden: false
            } as Win;

            idx++;

            return clampToWorkspace(
              nw
            );
          }
        );
      });
    }
  };

  const hideWindow = (
    id: string
  ) =>
    patchWindow(id, {
      hidden: true
    });

  const restoreWindow = (
    id: string
  ) => {
    const w = wins.find(
      x => x.id === id
    );

    if (
      w &&
      windowLoading[
      w.type
      ]
    ) {
      return;
    }

    if (w) {
      setWindowLoading(
        prev => ({
          ...prev,
          [w.type]: true
        })
      );

      setWindowError(
        prev => ({
          ...prev,
          [w.type]: null
        })
      );

      setTimeout(
        () =>
          setWindowLoading(
            prev => ({
              ...prev,
              [w.type]: false
            })
          ),
        500
      );
    }

    setZ(v => v + 1);

    patchWindow(id, {
      hidden: false,
      zIndex: z + 1
    });
  };

  const applyAgentResult = async (
    data: any
  ) => {
    const center =
      agentCoordinates(data);

    if (center) {
      setMap(current => ({
        ...current,
        center,
        zoom: Math.max(
          current.zoom,
          10
        )
      }));
    }

    const navigation = data?.map_navigation;
    const navigationLocations = Array.isArray(
      navigation?.locations
    )
      ? navigation.locations
      : [];

    if (
      navigation?.ambiguous === true &&
      navigation?.message
    ) {
      setChats(items =>
        items.map(item => {
          if (item.id !== active) return item;
          const messages = (item.messages ?? []).slice();
          const last = messages[messages.length - 1];
          if (!last || last.role !== 'assistant') return item;
          messages[messages.length - 1] = {
            ...last,
            text: `${last.text}\n\n${navigation.message}`
          };
          return { ...item, messages };
        })
      );
    } else if (
      navigation?.should_navigate &&
      navigationLocations.length > 0
    ) {
      const markers: MapMarker[] = navigationLocations
        .map((location: any) => ({
          lat: Number(location.latitude),
          lon: Number(location.longitude),
          label: String(
            location.display_name ||
            location.name ||
            'Selected location'
          )
        }))
        .filter((marker: MapMarker) =>
          Number.isFinite(marker.lat) &&
          Number.isFinite(marker.lon)
        );

      setActiveMarkers(markers);

      if (markers.length === 1) {
        setMap(current => ({
          ...current,
          center: [markers[0].lat, markers[0].lon],
          zoom: Number(navigation.zoom) || 11
        }));
      } else if (markers.length > 1) {
        const latitudes = markers.map(marker => marker.lat);
        const longitudes = markers.map(marker => marker.lon);
        setMap(current => ({
          ...current,
          center: [
            (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
            (Math.min(...longitudes) + Math.max(...longitudes)) / 2
          ],
          zoom: 8
        }));
      }
    } else {
      setActiveMarkers([]);
    }

    selectDomain(
      agentDomain(data)
    );

    const layerIds =
      agentLayerIds(data);

    setLayers(items =>
      items.map(layer =>
        layerIds.includes(
          layer.id
        )
          ? {
            ...layer,
            visible: true
          }
          : layer
      )
    );

    const flood =
      data?.data
        ?.flood_risk_heuristic;

    const parcelFeatures =
      data?.data
        ?.parcel_mapping
        ?.features;

    const backendWeather =
      data?.data
        ?.weather_tracker
        ?.live_weather;

    let liveWeather =
      backendWeather ||
      null;

    if (center) {
      try {
        const [
          lat,
          lon
        ] = center;

        console.log(
          '[GeoAI] Requesting live weather:',
          lat,
          lon
        );

        const weather =
          await getCurrentWeather(
            lat,
            lon
          );

        console.log(
          '[GeoAI] Live weather response:',
          weather
        );

        if (
          weather &&
          weather.status ===
          'ok'
        ) {
          liveWeather =
            weather;
        }
      } catch (error) {
        console.error(
          '[GeoAI] Live weather request failed:',
          error
        );
      }
    }

    setTelemetry(
      current => ({
        ...current,

        riskLevel:
          typeof flood?.risk_level ===
            'string'
            ? flood.risk_level
            : current.riskLevel,

        riskScore:
          typeof flood?.risk_score ===
            'number'
            ? flood.risk_score
            : current.riskScore,

        parcelCount:
          Array.isArray(
            parcelFeatures
          )
            ? parcelFeatures.length
            : current.parcelCount,

        parcelSource:
          typeof data?.data
            ?.parcel_mapping
            ?.provenance?.source ===
            'string'
            ? data.data.parcel_mapping
              .provenance.source
            : current.parcelSource,

        floodSource:
          typeof flood?.provenance
            ?.source === 'string'
            ? flood.provenance.source
            : current.floodSource,

        weather:
          liveWeather ||
          current.weather
      })
    );
  };

  /*
   * ============================================================
   * FIXED SEND FUNCTION
   * ============================================================
   */
  const send = async (
    text = input
  ) => {
    const hasFiles =
      attachedFiles.length >
      0;

    const fileSuffix =
      hasFiles
        ? `\n[Attached: ${attachedFiles
          .map(
            f => f.name
          )
          .join(
            ', '
          )}]`
        : '';

    const msgText = (
      text +
      fileSuffix
    ).trim();

    if (
      !msgText ||
      copilotLoading
    ) {
      return;
    }

    setInput('');
    setCopilotError(null);
    setCopilotLoading(true);

    try {
      let currentChat:
        | Chat
        | undefined =
        chat;
      const uploadedAssetIds = [...activeAssetIds];

      if (!currentChat) {
        currentChat =
          await createChatSession(
            domain
          );

        setChats(
          items => [
            currentChat!,
            ...items
          ]
        );

        setActive(
          currentChat.id
        );
      }

      for (const file of attachedFiles) {
        if (
          /\.(txt|md|csv)$/i.test(
            file.name
          )
        ) {
          continue;
        }

        const uploadResult = await uploadGeoAIFile(
          file
        );
        if (typeof uploadResult?.asset_id === 'string') {
          uploadedAssetIds.push(uploadResult.asset_id);
          setActiveAssetIds(uploadedAssetIds);
        }
        if (typeof uploadResult?.job_id === 'string') {
          const jobId = uploadResult.job_id;
          setActiveJobs(items => ({
            ...items,
            [jobId]: {
              job_id: jobId,
              user_id: '',
              kind: 'raster_conversion',
              status: 'pending',
              progress: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          }));
        }
      }

      const response = await copilotQuery(
        getCopilotSessionId(),
        msgText,
        uploadedAssetIds[0] ?? null,
        map.center
          ? {
            lat: map.center[0],
            lon: map.center[1],
            zoom: map.zoom
          }
          : null
      );
      const data = response.data;
      const replyText =
        response.text ||
        'Geospatial analysis completed.';

      const updated: Chat = {
        ...currentChat,
        messages: [
          ...(currentChat.messages || []),
          createMessage(
            'user',
            msgText
          ),
          createMessage(
            'assistant',
            replyText,
            'Now',
            response.rag_sources,
            response.provenance
          )
        ]
      };

      setChats(
        items =>
          items.map(
            item =>
              item.id ===
                currentChat!.id
                ? updated
                : item
          )
      );

      setCacheHit(
        response?.cache_hit ===
        true
      );

      setAttachedFiles([]);
      setActiveAssetIds([]);

      await applyAgentResult(
        data
      );

      applyMapAction(response);

      await appendUserMessage(
        currentChat.id,
        msgText
      );
      await appendAssistantMessage(
        currentChat.id,
        replyText
      );

    } catch (
    e: unknown
    ) {
      setCacheHit(false);

      setCopilotError(
        e instanceof Error
          ? e.message
          : 'Copilot request failed'
      );
    } finally {
      setCopilotLoading(
        false
      );
    }
  };

  /*
   * FIXED ADD SUMMARY
   */
  const addSummary = (
    text: string
  ) => {
    if (!chat) return;

    const message:
      Message =
      createMessage(
        'assistant',
        text,
        'Now'
      );

    setChats(
      items =>
        items.map(
          item =>
            item.id ===
              chat.id
              ? {
                ...item,
                messages: [
                  ...(item.messages ?? []),
                  message
                ]
              }
              : item
        )
    );
  };

  const handleDeleteSession = async (
    id: string
  ) => {
    try {
      await api(
        '/chats/' + id,
        {
          method: 'DELETE'
        }
      );

      setChats(
        prev =>
          prev.filter(
            c => c.id !== id
          )
      );

      if (id === active) {
        setActive('');
      }

      if (id === renamingId) {
        setRenamingId(null);
        setRenameDraft('');
      }
    } catch (
    err: any
    ) {
      setCopilotError(
        err.message
      );
    }
  };

  const saveRenamedSession = async (
    id: string
  ) => {
    if (!renameDraft.trim()) return;

    setRenameBusy(true);

    setChats(
      items =>
        items.map(
          item =>
            item.id === id
              ? {
                ...item,
                title: renameDraft
              }
              : item
        )
    );
    setRenamingId(null);
    setRenameDraft('');
    setRenameBusy(false);
  };

  const logout = async () => {
    await api(
      '/auth/logout',
      {
        method: 'POST'
      }
    ).catch(() => { });

    setUser(null);
    setLocked(false);
    setChats([]);
  };

  /*
   * ============================================================
   * FIXED SEARCH FUNCTION
   * ============================================================
   */
  const runSearch = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    const msgText =
      search.trim();

    if (
      !msgText ||
      searchLoading
    ) {
      return;
    }

    setSearchError(null);
    setSearchLoading(true);

    try {
      if (!chat) throw new Error('Chat session not found');

      const response = await copilotQuery(
        getCopilotSessionId(),
        msgText,
        null,
        map.center
          ? {
            lat: map.center[0],
            lon: map.center[1],
            zoom: map.zoom
          }
          : null
      );
      const data = response.data;

      setCacheHit(
        response?.cache_hit ===
        true
      );

      await applyAgentResult(
        data
      );

      setChats(
        items =>
          items.map(
            item =>
              item.id === chat.id
                ? {
                  ...item,
                  messages: [
                    ...(item.messages || []),
                    createMessage(
                      'user',
                      msgText
                    ),
                    createMessage(
                      'assistant',
                      response.text ||
                        'Geospatial analysis completed.',
                      'Now',
                      response.rag_sources,
                      response.provenance
                    )
                  ]
                }
                : item
          )
      );

      setSearch('');

      await appendUserMessage(
        chat.id,
        msgText
      );
      await appendAssistantMessage(
        chat.id,
        response.text ||
          'Geospatial analysis completed.'
      );

    } catch (
    e: unknown
    ) {
      setCacheHit(false);

      const message =
        e instanceof Error
          ? e.message
          : 'Geospatial search failed';

      setSearchError(
        message
      );

      setCopilotError(
        message
      );
    } finally {
      setSearchLoading(
        false
      );
    }
  };

  if (appBootLoading) {
    return (
      <div
        className="boot-screen"
        style={{
          display: 'grid',
          placeItems:
            'center',
          height: '100vh',
          background:
            'var(--bg)',
          color:
            'var(--text)'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection:
              'column',
            alignItems:
              'center',
            gap: '12px'
          }}
        >
          <LoadingSpinner
            size="lg"
            message="Loading workspace"
          />

          <span
            style={{
              fontSize: '10px',
              color:
                'var(--muted)',
              letterSpacing:
                '0.4px'
            }}
          >
            Loading workspace…
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        theme={theme}
        onLogin={setUser}
      />
    );
  }

  type MenuItem =
    | {
      label: string;
      action: () => void;
    }
    | {
      type: 'separator';
    };

  const menuItems: Record<
    string,
    MenuItem[]
  > = {
    File: [
      {
        label:
          'New Session',
        action: () =>
          send(
            'Create a new session'
          )
      }
    ],

    View: [
      {
        label: '2D GIS',
        action: () =>
          setMode('2d')
      },
      {
        label:
          'Globe View',
        action: () =>
          setMode(
            'globe'
          )
      },
      {
        type:
          'separator'
      },
      {
        label:
          'Cascade Windows',
        action: () =>
          arrange(
            'cascade'
          )
      },
      {
        label:
          'Tile Horizontally',
        action: () =>
          arrange('h')
      },
      {
        label:
          'Tile Vertically',
        action: () =>
          arrange('v')
      },
      {
        type:
          'separator'
      },
      {
        label:
          'Minimize All',
        action: () =>
          arrange('min')
      },
      {
        label:
          'Reset Layout',
        action: () =>
          arrange(
            'reset'
          )
      },
      {
        label:
          'Show/Hide Timeline',
        action: () =>
          setTimeline(
            value => !value
          )
      }
    ],

    Analysis: [
      {
        label: 'Mission',
        action: () =>
          open('Mission')
      },
      {
        label:
          'Spectral',
        action: () =>
          open(
            'Spectral'
          )
      },
      {
        label: 'Story',
        action: () =>
          open('Story')
      },
      {
        label:
          'Explain Area',
        action: () =>
          open(
            'Explain Area'
          )
      },
      {
        label:
          'Mission Report',
        action: () =>
          open(
            'Mission Report'
          )
      },
      {
        label:
          'Change Detection',
        action: () =>
          open(
            'Change Detection'
          )
      }
    ],

    Reports: [
      {
        label:
          'Mission Report',
        action: () =>
          open(
            'Mission Report'
          )
      },
      {
        label:
          'Generate Simulated Report',
        action: () =>
          open(
            'Mission Report'
          )
      }
    ],

    Help: [
      {
        label:
          'Keyboard shortcuts',
        action: () =>
          open('Mission')
      }
    ]
  };

  const grid = `${chatCollapsed
    ? 0
    : chatWidth
    }px ${chatCollapsed
      ? 0
      : 5
    }px minmax(0,1fr) ${copilotCollapsed
      ? 0
      : 5
    }px ${copilotCollapsed
      ? 0
      : copilotWidth
    }px`;

  return (
    <main
      id="app"
      className={`app theme-${theme} ${timeline
        ? ''
        : 'timeline-hidden'
        }`}
      onDragOver={e => {
        e.preventDefault();
        setIsDraggingOver(
          true
        );
      }}
      onDragLeave={() =>
        setIsDraggingOver(
          false
        )
      }
      onDrop={e => {
        e.preventDefault();

        setIsDraggingOver(
          false
        );

        const files =
          Array.from(
            e.dataTransfer
              .files
          );

        const allowed =
          /\.(txt|md|csv|pdf|png|jpe?g|tiff?|jp2|geojson|kml)$/i;

        const valid =
          files.filter(
            f =>
              allowed.test(
                f.name
              )
          );

        setFileProgress(
          12
        );

        let _prog = 12;

        const _iv =
          setInterval(
            () => {
              _prog =
                Math.min(
                  92,
                  _prog + 16
                );

              setFileProgress(
                _prog
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
              _iv
            );
          },
          900
        );

        if (valid.length) {
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
        }
      }}
    >
      {sessionRestoring && (
        <LoadingOverlay
          visible={
            sessionRestoring
          }
          message="Restoring workspace"
          subtle
        />
      )}

      <header className="app-menu">
        <div className="brand">
          <span className="brand-mark">
            G
          </span>{' '}
          GEOAI <b>PLATFORM</b>
        </div>

        <nav className="menus">
          {Object.entries(
            menuItems
          ).map(
            ([
              name,
              items
            ]) => {
              const isOpen =
                menu === name;

              return (
                <div
                  className="menu-wrap"
                  key={name}
                >
                  <button
                    ref={el => {
                      menuRefs.current[
                        name
                      ] = el;
                    }}
                    className={`menu-trigger ${isOpen
                      ? 'open'
                      : ''
                      }`}
                    onClick={() =>
                      setMenu(
                        isOpen
                          ? null
                          : name
                      )
                    }
                  >
                    {name}
                  </button>

                  {isOpen &&
                    menuPos &&
                    typeof document !==
                    'undefined' &&
                    createPortal(
                      <div
                        className="dropdown show"
                        style={{
                          position:
                            'fixed',
                          left:
                            menuPos.left +
                            'px',
                          top:
                            menuPos.top +
                            'px',
                          zIndex:
                            'var(--z-dropdown)'
                        }}
                      >
                        {items.map(
                          (
                            item: any,
                            idx: number
                          ) =>
                            'type' in
                              item &&
                              item.type ===
                              'separator' ? (
                              <div
                                key={
                                  'sep-' +
                                  idx
                                }
                                className="menu-sep"
                              />
                            ) : (
                              <button
                                key={
                                  item.label
                                }
                                onClick={() => {
                                  item.action();
                                  setMenu(
                                    null
                                  );
                                }}
                              >
                                {
                                  item.label
                                }
                              </button>
                            )
                        )}
                      </div>,
                      document.body
                    )}
                </div>
              );
            }
          )}
        </nav>

        <form
          className="global-search"
          onSubmit={
            runSearch
          }
        >
          ⌕

          <input
            value={search}
            onChange={e =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search locations, parcels, missions"
          />

          {searchLoading && (
            <LoadingSpinner
              size="xs"
            />
          )}

          <kbd>
            Enter
          </kbd>
        </form>
      </header>

      <section className="context-bar">
        <span className="context-label">
          ACTIVE DOMAIN
        </span>

        <div className="domain-capsule">
          {domains.map(
            name => (
              <button
                className={
                  domain === name
                    ? 'active'
                    : ''
                }
                key={name}
                onClick={() =>
                  selectDomain(
                    name
                  )
                }
              >
                {name}
              </button>
            )
          )}
        </div>

        <div className="domain-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setTheme(
                value =>
                  value ===
                    'dark'
                    ? 'bright'
                    : 'dark'
              )
            }
            aria-label={
              theme ===
                'dark'
                ? 'Switch to light mode'
                : 'Switch to dark mode'
            }
            aria-pressed={
              theme ===
              'dark'
            }
          >
            <span className="theme-toggle-label">
              {theme ===
                'dark'
                ? 'Dark'
                : 'Light'}
            </span>

            <span
              className={`theme-toggle-track ${theme ===
                'dark'
                ? 'dark'
                : 'light'
                }`}
            >
              <span className="theme-toggle-thumb" />
            </span>
          </button>

          <button
            onClick={() =>
              open(
                'Mission'
              )
            }
          >
            Missions
          </button>

          <button
            onClick={() =>
              open('Story')
            }
          >
            Story
          </button>

          <button
            ref={
              notifBtnRef
            }
            className="notification"
            onClick={() =>
              setNotesOpen(
                value =>
                  !value
              )
            }
          >
            Notifications
          </button>
        </div>

        {notesOpen &&
          notifPos &&
          typeof document !==
          'undefined' &&
          createPortal(
            <div
              className="notification-pop"
              style={{
                position:
                  'fixed',
                right: '12px',
                top:
                  notifPos.top +
                  'px',
                zIndex:
                  'var(--z-notification)'
              }}
            >
              {notes.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    fontSize:
                      '12px',
                    color:
                      'var(--muted)'
                  }}
                >
                  No notifications
                </p>
              ) : (
                notes.map(
                  note => (
                    <article
                    key={
                      note.id
                    }
                    className={
                      note.severity ===
                        'critical'
                        ? 'critical'
                        : ''
                    }
                    >
                      <b>
                        {
                        note.title
                        }
                      </b>

                      <span>
                        {
                        note.detail
                        }
                      </span>

                      <small>
                        {
                        note.time
                        }{' '}
                        · SIMULATED
                      </small>
                    </article>
                  )
                )
              )}
            </div>,
            document.body
          )}
      </section>

      <section
        className="work-area panel-shell rounded-xl overflow-hidden"
        style={{
          gridTemplateColumns:
            grid
        } as CSSProperties}
      >
        <LeftSidebar
          chatCollapsed={chatCollapsed}
          toggleChat={toggleChat}
          domain={domain}
          domainChats={domainChats}
          chat={chat}
          setActive={setActive}
          user={user}
          profile={profile}
          setProfile={setProfile}
          renamingId={renamingId}
          renameBusy={renameBusy}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          setRenamingId={setRenamingId}
          saveRenamedSession={saveRenamedSession}
          handleDeleteSession={handleDeleteSession}
          createChatSession={createChatSession}
          setChats={setChats}
          setCopilotError={setCopilotError}
          open={open}
          setLocked={setLocked}
          logout={logout}
        />

        <div
          className={`dock-resizer chat-resizer ${chatCollapsed
            ? 'is-disabled'
            : ''
            }`}
          onPointerDown={
            chatCollapsed
              ? undefined
              : chatResize
          }
        />

        <section
          className="map-workspace"
          style={{
            position:
              'relative'
          }}
        >
          {comparison.active ? (
            <>
              <CompareMapPair
                state={map}
                layers={layers}
                fromLabel={
                  comparison.from
                }
                toLabel={
                  comparison.to
                }
              />

              <button
                className="exit-compare-btn"
                onClick={() =>
                  setComparison(
                    c => ({
                      ...c,
                      active:
                        false
                    })
                  )
                }
              >
                EXIT COMPARISON
              </button>
            </>
          ) : isCompareMode &&
            mode === '2d' ? (
            <>
              <div
                className="compare-split"
                style={{
                  position:
                    'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection:
                    'row'
                }}
              >
                <div
                  className="compare-split-side compare-split-left"
                  style={{
                    flex: '1 1 50%',
                    minWidth: 0,
                    position:
                      'relative'
                  }}
                >
                  <MapEngine
                    mapRef={mapRef}
                    mode={mode}
                    state={map}
                    layers={
                      compareLeftLayers
                    }
                    mapOverlay={
                      mapOverlay
                    }
                    markers={
                      activeMarkers
                    }
                    onOverlayFeatureClick={
                      handleOverlayFeatureClick
                    }
                    onState={value =>
                      setMap(
                        current => ({
                          ...current,
                          ...value
                        })
                      )
                    }
                  />

                  <div
                    className="compare-side-tag left"
                    style={{
                      position:
                        'absolute',
                      top: 10,
                      left: 12,
                      zIndex: 900,
                      background:
                        'var(--panel2)',
                      color:
                        'var(--text)',
                      border:
                        '1px solid var(--border)',
                      borderRadius:
                        '8px',
                      padding:
                        '2px 8px',
                      fontSize:
                        '10px',
                      letterSpacing:
                        '0.08em',
                      fontWeight: 700
                    }}
                  >
                    SENTINEL-2 · BASE
                  </div>
                </div>

                <div
                  className="compare-split-divider"
                  style={{
                    width: 3,
                    background:
                      'var(--accent)',
                    zIndex: 900
                  }}
                />

                <div
                  className="compare-split-side compare-split-right"
                  style={{
                    flex: '1 1 50%',
                    minWidth: 0,
                    position:
                      'relative'
                  }}
                >
                  <MapEngine
                    mode={mode}
                    state={map}
                    layers={
                      compareRightLayers
                    }
                    mapOverlay={
                      mapOverlay
                    }
                    markers={
                      activeMarkers
                    }
                    onOverlayFeatureClick={
                      handleOverlayFeatureClick
                    }
                    onState={value =>
                      setMap(
                        current => ({
                          ...current,
                          ...value
                        })
                      )
                    }
                  />

                  <div
                    className="compare-side-tag right"
                    style={{
                      position:
                        'absolute',
                      top: 10,
                      right: 12,
                      zIndex: 900,
                      background:
                        'var(--panel2)',
                      color:
                        'var(--text)',
                      border:
                        '1px solid var(--border)',
                      borderRadius:
                        '8px',
                      padding:
                        '2px 8px',
                      fontSize:
                        '10px',
                      letterSpacing:
                        '0.08em',
                      fontWeight: 700
                    }}
                  >
                    {lastOverlayToggle.current ===
                    'ndvi'
                      ? 'NDVI · COMPARE'
                      : 'FLOOD · COMPARE'}
                  </div>
                </div>
              </div>

              <LoadingOverlay
                visible={mapLoading}
                message="Updating layer…"
                subtle
              />
            </>
          ) : (
            <>
              <MapEngine
                mapRef={mapRef}
                mode={mode}
                state={map}
                layers={layers}
                mapOverlay={
                  mapOverlay
                }
                markers={activeMarkers}
                onOverlayFeatureClick={
                  handleOverlayFeatureClick
                }
                onState={value =>
                  setMap(
                    current => ({
                      ...current,
                      ...value
                    })
                  )
                }
              />

              <LoadingOverlay
                visible={
                  mapLoading
                }
                message="Updating layer…"
                subtle
              />
            </>
          )}

          {!comparison.active && (
            <>
              <MapToolbar
                map={map}
                setMap={setMap}
                setMapLoading={setMapLoading}
                open={open}
                panel={panel}
                setPanel={setPanel}
                mode={mode}
                setMode={setMode}
                layers={layers}
                patchLayer={patchLayer}
                chat={chat}
                dateIndex={dateIndex}
              />

              <div className="windows-layer">
                {wins
                  .filter(
                    w =>
                      !w.hidden
                  )
                  .map(
                    item => (
                      <AnalysisWindow
                        key={
                          item.id
                        }
                        item={
                          item
                        }
                        onFocus={() =>
                          focusWindow(
                            item.id
                          )
                        }
                        onHide={() =>
                          hideWindow(
                            item.id
                          )
                        }
                        onPatch={value =>
                          patchWindow(
                            item.id,
                            value
                          )
                        }
                        windowLoading={
                          windowLoading
                        }
                        windowError={
                          windowError
                        }
                        onRetry={type => {
                          setWindowLoading(
                            prev => ({
                              ...prev,
                              [type]:
                                true
                            })
                          );

                          setWindowError(
                            prev => ({
                              ...prev,
                              [type]:
                                null
                            })
                          );

                          setTimeout(
                            () =>
                              setWindowLoading(
                                prev => ({
                                  ...prev,
                                  [type]:
                                    false
                                })
                              ),
                            650
                          );
                        }}
                      />
                    )
                  )}
              </div>
            </>
          )}
        </section>

        <div
          className={`dock-resizer copilot-resizer ${copilotCollapsed
            ? 'is-disabled'
            : ''
            }`}
          onPointerDown={
            copilotCollapsed
              ? undefined
              : copilotResize
          }
        />

        <Copilot
          dock={rightDock}
          chat={chat}
          setChats={setChats}
          input={input}
          setInput={setInput}
          onSend={send}
          attachedFiles={
            attachedFiles
          }
          setAttachedFiles={
            setAttachedFiles
          }
          loading={
            copilotLoading
          }
          error={
            copilotError
          }
          setCopilotError={
            setCopilotError
          }
          onRetry={() =>
            send()
          }
          fileProgress={
            fileProgress
          }
          setFileProgress={
            setFileProgress
          }
          isDraggingOver={
            isDraggingOver
          }
        />
      </section>

      {timeline && (
        <Timeline
          timelineLoading={timelineLoading}
          playing={playing}
          setPlaying={setPlaying}
          dateIndex={dateIndex}
          setDateIndex={setDateIndex}
          timelineHover={timelineHover}
          setTimelineHover={setTimelineHover}
          hoveredIndex={hoveredIndex}
          setHoveredIndex={setHoveredIndex}
          timelineTooltipPosition={timelineTooltipPosition}
          setTimelineTooltipPosition={setTimelineTooltipPosition}
          setTimeline={setTimeline}
          isCompareMode={isCompareMode}
          onToggleCompare={() =>
            setIsCompareMode(
              current =>
                !current
            )
          }
        />
      )}

      {Object.values(activeJobs).length > 0 && (
        <section
          className="job-queue panel-shell rounded-xl overflow-hidden"
          style={{
            padding: '0.5rem 0.75rem',
            margin: '0 0 0.5rem'
          }}
        >
          <b
            style={{
              fontSize: '0.65rem',
              letterSpacing: '0.08em'
            }}
          >
            ASYNC JOBS
          </b>

          {Object.values(activeJobs)
            .slice(0, 5)
            .map(job => (
              <div
                key={job.job_id}
                className="job-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.35rem'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.72rem'
                    }}
                  >
                    <span>
                      {job.kind}
                    </span>
                    <span>
                      {job.progress}% ·{' '}
                      {job.status}
                    </span>
                  </div>

                  <div
                    className="progress-track"
                    style={{
                      height: 6,
                      background:
                        'rgba(127,127,127,0.25)',
                      borderRadius: 3,
                      marginTop: 2
                    }}
                  >
                    <div
                      className="progress-fill"
                      style={{
                        width: `${job.progress}%`,
                        height: '100%',
                        background:
                          job.status ===
                          'failed'
                            ? '#d9534f'
                            : job.status ===
                              'succeeded'
                              ? '#16a34a'
                              : '#0890D9',
                        borderRadius: 3,
                        transition:
                          'width 0.3s ease'
                      }}
                    />
                  </div>

                  {job.status ===
                    'failed' &&
                    job.error?.message && (
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: '#d9534f'
                        }}
                      >
                        {job.error.message}
                      </div>
                    )}

                  {job.status ===
                    'succeeded' && (
                    <div
                      style={{
                        fontSize: '0.68rem',
                        color: '#16a34a'
                      }}
                    >
                      Ready — satellite
                      processing complete
                    </div>
                  )}
                </div>
              </div>
            ))}
        </section>
      )}

      <footer className="status-bar telemetry telemetry-grid-fix panel-shell rounded-xl overflow-hidden">
        <div className="telemetry-cell">
          <b>
            MISSION TELEMETRY
          </b>

          <strong>
            Sentinel-1/2 Active
          </strong>
        </div>

        <div className="telemetry-cell">
          <b>
            HEURISTIC FLOOD RISK
          </b>

          <strong className="risk">
            {telemetry.riskLevel
              ? `${telemetry.riskLevel} · ${telemetry.riskScore?.toFixed(
                1
              )}/100`
              : 'Ask Copilot to assess an area'}
            {telemetry.floodSource && (
              <ProvenanceBadge
                label="source"
                source={telemetry.floodSource}
              />
            )}
          </strong>
        </div>

        <div className="telemetry-cell">
          <b>
            PARCELS IN AOI
          </b>

          <strong>
            {selectedParcel
              ? `${selectedParcel.id} · ${selectedParcel.area
                ? `${Math.round(
                    selectedParcel.area
                  )} sqm`
                : ''}${selectedParcel.landUse
                ? ` · ${selectedParcel.landUse}`
                : ''}`
              : telemetry.parcelCount !==
                null
                ? `${telemetry.parcelCount} found (${telemetry.parcelSource ===
                  'LIVE' ||
                  telemetry.parcelSource ===
                  'DB'
                  ? 'live DB'
                  : 'fallback'})`
                : 'No query yet'}
            {telemetry.parcelSource && (
              <ProvenanceBadge
                label="source"
                source={telemetry.parcelSource}
              />
            )}
          </strong>
        </div>

        <div className="telemetry-cell">
          <b>
            SPATIAL BBOX
          </b>

          <strong className="positive">
            {telemetry.bboxAreaKm2.toFixed(
              2
            )}{' '}
            km² · 1km radius
          </strong>
        </div>

        <div className="telemetry-cell">
          <b>
            LIVE WEATHER
          </b>

          <strong>
            {telemetry.weather
              ? `${Number(
                telemetry
                  .weather
                  .temperature_celsius
              ).toFixed(
                1
              )}°C · ${Number(
                telemetry
                  .weather
                  .wind_speed_kmh ??
                (telemetry
                  .weather
                  .wind_speed_mps ??
                  0) * 3.6
              ).toFixed(
                0
              )} km/h wind · ${Number(
                telemetry
                  .weather
                  .precipitation_mm
              ).toFixed(
                1
              )} mm/h`
              : 'Select an area or ask Copilot'}
          </strong>
        </div>
      </footer>

      {comparison.open && (
        <CompareDialog
          onClose={() =>
            setComparison(
              c => ({
                ...c,
                open: false
              })
            )
          }
          onConfirm={(
            from,
            to
          ) => {
            setComparison({
              open: false,
              active: true,
              from,
              to
            });

            addSummary(
              `SYSTEM · Comparison completed\n${from} · ${to}\n\nVegetation: -12.4%\nBuilt-up: +18.7%\nWater: +6.3%\nChanged area: 21.6 km²\n\nDEMO DATA`
            );
          }}
        />
      )}

      {isDraggingOver && (
        <div className="drag-overlay pointer-events-none fixed inset-0 z-50 border-4 border-primary bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-semibold">
            Drop file to attach to chat
          </span>
        </div>
      )}

      {locked && (
        <Lock
          theme={theme}
          onUnlock={() =>
            setLocked(false)
          }
          onLogout={logout}
        />
      )}
    </main>
  );
}

const rootElement =
  document.getElementById(
    'root'
  );

if (!rootElement) {
  throw new Error(
    'Root element not found'
  );
}

const root =
  createRoot(rootElement);

root.render(
  <App />
);