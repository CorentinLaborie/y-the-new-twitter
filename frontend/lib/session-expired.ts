/*
 * Session expired (product doc, section 11 state table: "Session expired"). When a call of the protected area answers
 * 401, the session is gone (expired, or never there). The browser goes to the login page with a marker in the URL.
 * The marker carries no personal data: no e-mail, no identifier.
 *
 * Every client call of the protected area goes through protectedApiRequest, so the redirect is made in one place.
 * The public calls (login, signup, forgot password) keep apiRequest: a 401 there is a wrong password, not an expiry.
 */

import { apiRequest, type ApiProblem } from '@/lib/api-client';

/** Value of the `reason` parameter of the login URL. */
export const SESSION_EXPIRED_REASON = 'session-expired';

export const SESSION_EXPIRED_LOGIN_PATH = `/login?reason=${SESSION_EXPIRED_REASON}`;

type ApiMethod = Parameters<typeof apiRequest>[0];
type ApiOptions = Parameters<typeof apiRequest>[2];
type ApiCallResult<T> = Awaited<ReturnType<typeof apiRequest<T>>>;

/** True when the API refused the call because the visitor has no valid session. */
export function isSessionExpired(problem: ApiProblem): boolean {
  return problem.status === 401;
}

/**
 * Sends the browser to the login page with the session-expired marker. `replace` keeps the protected page out of the
 * history, so Back does not return to a page that needs a session.
 */
export function redirectToSessionExpiredLogin(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.location.replace(SESSION_EXPIRED_LOGIN_PATH);
}

/**
 * apiRequest for the protected area: a 401 answer sends the visitor to the login page. The result is still returned,
 * so the caller can keep its own state until the navigation takes over.
 */
export async function protectedApiRequest<T>(
  method: ApiMethod,
  path: string,
  options?: ApiOptions,
): Promise<ApiCallResult<T>> {
  const result = await apiRequest<T>(method, path, options);
  if (!result.ok && isSessionExpired(result.problem)) {
    redirectToSessionExpiredLogin();
  }
  return result;
}
