import { cookies } from 'next/headers';
import { getSession, type SessionUser } from '@/lib/auth-api';

/** Name of the session cookie set by the API (backend, sessions). */
const SESSION_COOKIE = 'SESSION';

/**
 * The signed-in user, read on the server. The API is another origin, so only the visitor's SESSION cookie is
 * forwarded to it. Null for a guest, and also when the API cannot say (unreachable, or an error).
 */
export async function readSessionUser(): Promise<SessionUser | null> {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE);
  const result = await getSession(sessionCookie ? `${SESSION_COOKIE}=${sessionCookie.value}` : '');
  return result.ok ? result.body.user : null;
}
