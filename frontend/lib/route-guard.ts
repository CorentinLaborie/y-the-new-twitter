/*
 * Redirection rules of the protected area (rule F9). Pure functions, no Next.js import, so they are easy to test.
 * Every page under app/(app)/ must be listed in PROTECTED_PATHS.
 */

/** Routes of the protected area (app/(app)/). A path is protected when it equals an entry or starts with it. */
export const PROTECTED_PATHS: readonly string[] = ['/accueil'];

/** Where the user lands after logging in when no valid `next` is given. */
export const DEFAULT_AFTER_LOGIN_PATH = '/accueil';

/** Header that carries the requested path to server code, set by the proxy when it exists. */
export const REQUESTED_PATH_HEADER = 'x-pathname';

const LOGIN_PATH = '/login';
const ORIGIN = 'http://local.invalid';
const MAX_NEXT_LENGTH = 2048;
// Control characters and backslashes: browsers may read "/\host" as a protocol-relative URL.
const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

export function isProtectedPath(pathname: string): boolean {
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

/** Login URL for a guest who asked for `requestedPath`. The `next` parameter is kept only when it is usable. */
export function loginRedirectPath(requestedPath: string | null | undefined): string {
  const next = safeNextPath(requestedPath);
  return next ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH;
}

/** Where to go after a successful login, given the `next` query parameter. */
export function afterLoginPath(next: string | null | undefined): string {
  return safeNextPath(next) ?? DEFAULT_AFTER_LOGIN_PATH;
}
