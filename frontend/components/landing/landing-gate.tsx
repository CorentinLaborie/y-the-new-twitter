import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-api';
import { Landing } from './landing';

/** Name of the session cookie set by the API (the same cookie as the protected area, app/(app)/session-guard.ts). */
const SESSION_COOKIE = 'SESSION';

/**
 * Visitor landing, guests only: a signed-in user is sent to the feed. The session is read on the server, with only
 * the SESSION cookie forwarded to the API. When the API cannot say (unreachable, or an error), the visitor is a guest.
 */
export async function LandingGate() {
  const session = (await cookies()).get(SESSION_COOKIE);
  const result = await getSession(session ? `${SESSION_COOKIE}=${session.value}` : '');
  if (result.ok && result.body.user) {
    redirect('/home');
  }

  return <Landing />;
}
