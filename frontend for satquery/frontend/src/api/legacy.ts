import { refreshSession } from './client';

export const api = async (
  path: string,
  options: RequestInit = {}
) => {
  const attempt = async () =>
    fetch(
      '/api/v1' + path,
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      }
    );

  let response = await attempt();

  if (
    response.status === 401 &&
    !String(path).startsWith('/auth/')
  ) {
    const ok = await refreshSession();

    if (ok) {
      response = await attempt();
    }
  }

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({}));

    const errorMessage =
      typeof body.error === 'string'
        ? body.error
        : typeof body.detail === 'string'
          ? body.detail
          : 'Request failed';

    throw new Error(errorMessage);
  }

  return response.status === 204
    ? null
    : response.json();
};

export const uid = () =>
  crypto.randomUUID();

export const getCopilotSessionId = () => {
  try {
    const stored = localStorage.getItem(
      'geoai-copilot-session'
    );

    if (stored?.trim()) {
      return stored;
    }

    const created = uid();

    localStorage.setItem(
      'geoai-copilot-session',
      created
    );

    return created;
  } catch {
    return uid();
  }
};