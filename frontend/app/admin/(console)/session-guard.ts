import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminSession, type AdminSession } from '@/lib/admin-api';
import { SESSION_COOKIE } from '@/lib/session';

const ADMIN_LOGIN_PATH = '/admin/login';

/**
 * Session check of the back-office, run on the server. The API answers 401 when the visitor has no administrator
 * session with a current elevation, and 404 for anyone else: both send the visitor to the login screen.
 * The answer is cached for the render, so the layout and the page make one call.
 */
export const requireAdminSession = cache(async (): Promise<AdminSession> => {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE);
  const result = await getAdminSession(
    sessionCookie ? `${SESSION_COOKIE}=${sessionCookie.value}` : undefined,
  );
  if (result.ok) {
    return result.body;
  }

  redirect(ADMIN_LOGIN_PATH);
});
