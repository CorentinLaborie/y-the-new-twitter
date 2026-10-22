/** Back-office session limits (DEC-036, DEC-082): 30 minutes without a request, 8 hours at most from the login. */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ADMIN_MAX_SESSION_MS = 8 * 60 * 60 * 1000;
/** A re-authentication (the password again) covers the sensitive actions for 10 minutes (DEC-088). */
export const ADMIN_REAUTH_WINDOW_MS = 10 * 60 * 1000;
/** The 401 answer of an elevated route when no elevation is current (DEC-036). */
export const ADMIN_SIGN_IN_REQUIRED_MESSAGE = 'Connexion administrateur requise.';

/** The back-office elevation of a session: set at the sign-in, kept in sessions.data. Dates are ISO strings. */
interface AdminElevation {
  readonly verifiedAt: string;
  readonly lastSeenAt: string;
}

declare module 'express-session' {
  interface SessionData {
    admin?: AdminElevation;
    /** When the administrator last re-authenticated, as an ISO string. Kept apart from the elevation (DEC-082). */
    reauth_at?: string;
  }
}

export function startElevation(now: Date): AdminElevation {
  const at = now.toISOString();
  return { verifiedAt: at, lastSeenAt: at };
}

/** True while the elevation is inside both limits. A missing elevation is never elevated. */
export function isElevated(elevation: AdminElevation | undefined, now: Date): boolean {
  if (elevation === undefined) {
    return false;
  }

  return (
    now.getTime() - Date.parse(elevation.verifiedAt) <= ADMIN_MAX_SESSION_MS &&
    now.getTime() - Date.parse(elevation.lastSeenAt) <= ADMIN_IDLE_TIMEOUT_MS
  );
}

/** True within 10 minutes of the last re-authentication. A missing re-authentication is never current. */
export function isReauthenticated(reauthAt: string | undefined, now: Date): boolean {
  return reauthAt !== undefined && now.getTime() - Date.parse(reauthAt) <= ADMIN_REAUTH_WINDOW_MS;
}
