/*
 * The one client of the Y API: base URL, Problem Details errors, and the CSRF token of every mutation (DEC-138).
 * Used by the account API (lib/auth-api.ts), the feed API (lib/feed-api.ts) and the health page (getHealth).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type ApiProblem = {
  status: number;
  title: string;
  detail: string;
  retryAfterSeconds?: number;
  /** Stable code of the refusal (Problem Details extension), when the API sends one. See lib/api-messages.ts. */
  code?: string;
};

type ApiResult<T> = { ok: true; status: number; body: T } | { ok: false; problem: ApiProblem };

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type ApiRequestOptions = {
  body?: unknown;
  /** Server-side calls (the protected area) have no browser cookies: the caller passes the session cookie. */
  cookie?: string;
  headers?: Record<string, string>;
};

function readCsrfToken(cookieHeader: string): string | null {
  const match = /(?:^|;\s*)y_csrf=([^;]+)/.exec(cookieHeader);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The token lives in a cookie that the API sets on its first safe (GET) answer. On a fresh visit no such
 * answer has been received yet, so a safe request is sent first. A network failure here is left to the
 * mutation itself, which reports it.
 */
async function csrfToken(): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  const existingToken = readCsrfToken(document.cookie);
  if (existingToken) {
    return existingToken;
  }
  try {
    await fetch(`${API_BASE_URL}/api/v1/status`, { credentials: 'include' });
  } catch {
    return null;
  }
  return readCsrfToken(document.cookie);
}

/** Calls the API under /api/v1. Errors come back as Problem Details, never thrown. */
export async function apiRequest<T>(
  method: ApiMethod,
  path: string,
  { body, cookie, headers: extraHeaders = {} }: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  if (method !== 'GET') {
    const token = await csrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, problem: { status: 0, title: 'Réseau', detail: 'Le serveur est injoignable.' } };
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      title?: string;
      detail?: string;
      code?: string;
    };
    const retryAfter = Number(response.headers.get('Retry-After'));
    return {
      ok: false,
      problem: {
        status: response.status,
        title: errorBody.title ?? response.statusText,
        detail: errorBody.detail ?? 'Une erreur est survenue.',
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        code: errorBody.code,
      },
    };
  }

  try {
    const text = await response.text();
    return { ok: true, status: response.status, body: (text ? JSON.parse(text) : {}) as T };
  } catch {
    return {
      ok: false,
      problem: { status: response.status, title: 'Réponse', detail: 'La réponse du serveur est illisible.' },
    };
  }
}

/** Health of the backend, as reported by /health (outside the /api/v1 prefix). */
type HealthReport = {
  reachable: boolean;
  healthy: boolean;
  components: Record<string, string>;
};

/**
 * Reads /health. A 503 is a report (some check is down), not an error: the page shows it.
 * An unreachable backend is reported too, so the page never fails because of the API.
 */
export async function getHealth(): Promise<HealthReport> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
    const body = (await response.json()) as {
      status?: string;
      details?: Record<string, { status: string }>;
    };
    const components = Object.fromEntries(
      Object.entries(body.details ?? {}).map(([name, check]) => [name, check.status]),
    );

    return { reachable: true, healthy: response.ok && body.status === 'ok', components };
  } catch {
    return { reachable: false, healthy: false, components: {} };
  }
}
