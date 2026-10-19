/*
 * Client of the account API (M1). Contract: docs/plans/M1-PLAN.md, "API contract".
 * Every mutation sends the CSRF token from the `y_csrf` cookie in the `X-CSRF-Token` header (DEC-138).
 */

export type ApiUser = { handle: string; displayName: string };

export type ApiProblem = {
  status: number;
  title: string;
  detail: string;
  retryAfterSeconds?: number;
};

export type ApiResult<T> = { ok: true; status: number; body: T } | { ok: false; problem: ApiProblem };

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export function readCsrfToken(cookieHeader: string): string | null {
  const match = /(?:^|;\s*)y_csrf=([^;]+)/.exec(cookieHeader);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') {
    const token = typeof document === 'undefined' ? null : readCsrfToken(document.cookie);
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
    const json = (await response.json().catch(() => ({}))) as { title?: string; detail?: string };
    const retryAfter = Number(response.headers.get('Retry-After'));
    return {
      ok: false,
      problem: {
        status: response.status,
        title: json.title ?? response.statusText,
        detail: json.detail ?? 'Une erreur est survenue.',
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      },
    };
  }

  const text = await response.text();
  return { ok: true, status: response.status, body: (text ? JSON.parse(text) : {}) as T };
}

export type SignupInput = {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  birthDate: string;
  termsAccepted: true;
  termsVersion: '1.0';
  phone?: string;
};

export const signup = (input: SignupInput) => request<Record<string, never>>('POST', '/auth/signup', input);
export const verifySignup = (email: string, code: string) =>
  request<Record<string, never>>('POST', '/auth/signup/verify', { email, code });
export const resendSignupCode = (email: string) =>
  request<Record<string, never>>('POST', '/auth/signup/resend', { email });
export const login = (email: string, password: string) =>
  request<{ user: ApiUser }>('POST', '/auth/login', { email, password });
export const logout = () => request<Record<string, never>>('POST', '/auth/logout');
export const getSession = () => request<{ user: ApiUser | null }>('GET', '/auth/session');
export const requestPasswordReset = (email: string) =>
  request<Record<string, never>>('POST', '/auth/password-reset/request', { email });
export const confirmPasswordReset = (email: string, code: string, password: string) =>
  request<Record<string, never>>('POST', '/auth/password-reset/confirm', { email, code, password });
export const requestEmailChange = (newEmail: string) =>
  request<Record<string, never>>('POST', '/auth/email-change/request', { newEmail });
export const confirmEmailChange = (code: string) =>
  request<Record<string, never>>('POST', '/auth/email-change/confirm', { code });
