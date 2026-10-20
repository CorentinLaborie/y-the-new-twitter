import { redirect } from 'next/navigation';
import { readSessionUser } from '@/lib/session';
import { Landing } from './landing';

/**
 * Visitor landing, guests only: a signed-in user is sent to the feed. The session is read on the server, with only
 * the SESSION cookie forwarded to the API. When the API cannot say (unreachable, or an error), the visitor is a guest.
 */
export async function LandingGate() {
  const user = await readSessionUser();
  if (user) {
    redirect('/home');
  }

  return <Landing />;
}
