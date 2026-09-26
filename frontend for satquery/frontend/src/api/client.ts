export const API_BASE = 'https://satquery-88xa.onrender.com/api';


export const AUTH_EXPIRED_EVENT = 'geoai-auth-expired';

const noRetryPaths = new Set([
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
  '/v1/auth/logout-all',
]);

let refreshInFlight: Promise<boolean> | null = null;

export function notifyAuthExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(res => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function forceLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore best-effort server logout
  }
  notifyAuthExpired();
}

export type ApiErrorBody = {
  error?: { message?: string } | string;
  detail?: string | string[] | { message?: string };
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const normalizeErrorMessage = (body: unknown): string => {
  if (!body) {
    return 'Request failed';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object') {
    const record = body as Record<string, unknown>;

    if (typeof record.error === 'string') {
      return record.error;
    }

    if (record.error && typeof record.error === 'object') {
      const error = record.error as { message?: string };
      if (typeof error.message === 'string') {
        return error.message;
      }
    }

    if (typeof record.detail === 'string') {
      return record.detail;
    }

    if (Array.isArray(record.detail)) {
      return record.detail.map(item => String(item)).join(', ');
    }

    if (record.detail && typeof record.detail === 'object') {
      const detail = record.detail as { message?: string };
      if (typeof detail.message === 'string') {
        return detail.message;
      }
    }
  }

  return 'Request failed';
};

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | undefined> {
  const isMultipart = options.body instanceof FormData;

  const attempt = async (): Promise<Response> => {
    const headers = new Headers(options.headers || {});

    if (!isMultipart && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });
  };

  let response = await attempt();

  if (response.status === 401 && !noRetryPaths.has(path)) {
    const ok = await refreshSession();
    if (ok) {
      response = await attempt();
    }
    if (response.status === 401) {
      await forceLogout();
    }
  }

  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : undefined;

  if (!response.ok) {
    const message = normalizeErrorMessage(data ?? (await Promise.resolve(text ? JSON.parse(text) : {})));
    throw new Error(message);
  }

  return data;
}

export type User = {
  id: string;
  email: string;
  username: string;
  role: string;
};

export type RegisterPayload = {
  email: string;
  username: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type ChatPayload = {
  title: string;
  context: string;
};

export type ChatMessagePayload = {
  role: 'user' | 'assistant';
  text: string;
};

export type CopilotPayload = {
  session_id: string;
  prompt: string;
  asset_id: string | null;
  enable_cache: boolean;
};

export type AssetUploadResponse = {
  asset_id: string;
  status: string;
  job_id?: string;
};

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type Job = {
  job_id: string;
  user_id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  result?: Record<string, unknown> | null;
  error?: { type?: string; message?: string; [key: string]: unknown } | null;
  created_at: string;
  updated_at: string;
  dispatch?: string;
};

export type WeatherCurrentResponse = {
  status: string;
  [key: string]: unknown;
};

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<User>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload) =>
    request<{ authenticated: boolean; user: User }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<void>('/v1/auth/logout', {
      method: 'POST',
    }),

  refresh: () =>
    request<{ refreshed: boolean }>('/v1/auth/refresh', {
      method: 'POST',
    }),

  logoutAll: () =>
    request<void>('/v1/auth/logout-all', {
      method: 'POST',
    }),

  me: () => request<User>('/v1/auth/me'),
};

export const chatApi = {
  list: () => request<Array<Record<string, unknown>>>('/v1/chats'),

  create: (payload: ChatPayload) =>
    request<Record<string, unknown>>('/v1/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (id: string) => request<Record<string, unknown>>(`/v1/chats/${encodeURIComponent(id)}`),

  delete: (id: string) =>
    request<void>(`/v1/chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  postMessage: (id: string, payload: ChatMessagePayload) =>
    request<Record<string, unknown>>(`/v1/chats/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const copilotApi = {
  query: (payload: CopilotPayload) =>
    request<Record<string, unknown>>('/v1/copilot/query', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const weatherApi = {
  current: (lat: number, lon: number) =>
    request<WeatherCurrentResponse>(`/v1/weather/current?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),

  health: () => request<Record<string, unknown>>('/v1/weather/health'),
};

export const modulesApi = {
  parcels: (lat: number, lon: number, radiusMeters = 1000) =>
    request<Record<string, unknown>>(`/v1/parcels?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius_meters=${encodeURIComponent(radiusMeters)}`),

  floodRisk: (lat: number, lon: number) =>
    request<Record<string, unknown>>(`/v1/disaster/flood-risk?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),

  weather: (lat: number, lon: number) =>
    request<Record<string, unknown>>(`/v1/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
};

export const satqueryApi = {
  scenes: (params: Record<string, string | number | boolean | null | undefined>) => {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      query.append(key, String(value));
    });

    return request<Record<string, unknown>>(`/v1/satquery/scenes?${query.toString()}`);
  },

  coverage: (params: Record<string, string | number | boolean | null | undefined>) => {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      query.append(key, String(value));
    });

    return request<Record<string, unknown>>(`/v1/satquery/coverage?${query.toString()}`);
  },
};

export const assetsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);

    return request<AssetUploadResponse>('/v1/assets/upload', {
      method: 'POST',
      body: form,
    });
  },
};

export const jobsApi = {
  list: () => request<Job[]>('/v1/jobs'),
  get: (jobId: string) => request<Job>(`/v1/jobs/${jobId}`),
};

export const healthApi = {
  live: () => request<Record<string, unknown>>('/v1/health/live'),
  ready: () => request<Record<string, unknown>>('/v1/health/ready'),
};
