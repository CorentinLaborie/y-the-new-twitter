import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/lib/auth-api';
import { loginRedirectPath, REQUESTED_PATH_HEADER } from '@/lib/route-guard';
import { readSessionUser } from '@/lib/session';

/**
 * Session check for the protected area, run on the server. Layouts do not re-render on client navigation,
 * so every page of app/(app)/ calls it too. Without a user, or when the API cannot say, the guest goes to the login page
 * with the session-expired reason (loginRedirectPath), which shows its message.
 * The answer is cached for the render, so the layout and the page make one call.
 */
export const requireSession = cache(async (): Promise<SessionUser> => {
  const user = await readSessionUser();
  if (user) {
    return user;
  }

  const requestedPath = (await headers()).get(REQUESTED_PATH_HEADER);
  redirect(loginRedirectPath(requestedPath));
});
