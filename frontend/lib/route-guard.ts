/*
 * Redirection rules of the protected area (rule F9). Pure functions, no Next.js import, so they are easy to test.
 * Every page under app/(app)/ must be listed in PROTECTED_PATHS.
 */

import { SESSION_EXPIRED_REASON } from '@/lib/session-expired';

/** Routes of the protected area (app/(app)/). A path is protected when it equals an entry or starts with it. */
const PROTECTED_PATHS: readonly string[] = [
  '/home',
  '/notifications',
  '/settings',
  '/bookmarks',
  '/explore',
  '/hashtags',
];

/** Where the user lands after logging in when no valid `next` is given. */
export const DEFAULT_AFTER_LOGIN_PATH = '/home';

/** Header that carries the requested path to server code, set by the proxy when it exists. */
export const REQUESTED_PATH_HEADER = 'x-pathname';

const LOGIN_PATH = '/login';
const ORIGIN = 'http://local.invalid';
const MAX_NEXT_LENGTH = 2048;
// Control characters and backslashes: browsers may read "/\host" as a protocol-relative URL.
const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Returns the relative path (pathname and query string) when it is safe to redirect to and lies in the
 * protected area, otherwise null. Absolute URLs, protocol-relative URLs and public pages are refused.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_NEXT_LENGTH) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || FORBIDDEN_CHARACTERS.test(value)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN || !isProtectedPath(url.pathname)) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Login URL for a guest who asked for `requestedPath` on a protected page: the session-expired reason (the login page
 * shows its message), and `next` only when the path is safe and carries no query string (a query may hold personal data).
 */
export function loginRedirectPath(requestedPath: string | null | undefined): string {
  const next = safeNextPath(requestedPath);
  const params = new URLSearchParams({ reason: SESSION_EXPIRED_REASON });
  if (next !== null && !next.includes('?')) {
    params.set('next', next);
  }
  return `${LOGIN_PATH}?${params.toString()}`;
}
