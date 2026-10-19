import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, type ApiUser } from '@/lib/auth-api';
import { loginRedirectPath, REQUESTED_PATH_HEADER } from '@/lib/route-guard';

/** Name of the session cookie set by the API (backend, sessions). */
const SESSION_COOKIE = 'SESSION';

/**
 * Session check for the protected area, run on the server. Layouts do not re-render on client navigation,
 * so every page of app/(app)/ calls it too. Without a user, or when the API cannot say, the guest goes to /login.
 * The answer is cached for the render, so the layout and the page make one call.
 * The API is another origin, so the visitor's SESSION cookie is forwarded to it, and nothing else.
 */
export const requireSession = cache(async (): Promise<ApiUser> => {
  const session = (await cookies()).get(SESSION_COOKIE);
  const result = await getSession(session ? `${SESSION_COOKIE}=${session.value}` : '');
  if (result.ok && result.body.user) {
    return result.body.user;
  }

  const requestedPath = (await headers()).get(REQUESTED_PATH_HEADER);
  redirect(loginRedirectPath(requestedPath));
});
