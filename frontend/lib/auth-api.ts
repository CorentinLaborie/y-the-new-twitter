/*
 * Client of the account API (M1). Contract: docs/plans/M1-PLAN.md, "API contract".
 * Every mutation sends the CSRF token from the `y_csrf` cookie in the `X-CSRF-Token` header (DEC-138),
 * through the shared client in lib/api-client.ts.
 */

import { apiRequest } from '@/lib/api-client';

export type ApiUser = { handle: string; displayName: string };

/** Account status, as GET /auth/session sends it in `user.status`. */
export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'pending_deletion' | 'deleted';

/** The signed-in user of GET /auth/session: the account fields, and the status of the account. */
export type SessionUser = ApiUser & { status: AccountStatus };

type SignupInput = {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  birthDate: string;
  termsAccepted: true;
  termsVersion: '1.0';
  phone?: string;
};

export const signup = (input: SignupInput) =>
  apiRequest<Record<string, never>>('POST', '/auth/signup', { body: input });
export const verifySignup = (email: string, code: string) =>
  apiRequest<Record<string, never>>('POST', '/auth/signup/verify', { body: { email, code } });
export const resendSignupCode = (email: string) =>
  apiRequest<Record<string, never>>('POST', '/auth/signup/resend', { body: { email } });
export const login = (email: string, password: string) =>
  apiRequest<{ user: ApiUser }>('POST', '/auth/login', { body: { email, password } });
/** `cookie` is the SESSION cookie of the visitor when the call is made on the server (see requireSession). */
export const getSession = (cookie?: string) =>
  apiRequest<{ user: SessionUser | null }>('GET', '/auth/session', { cookie });
export const requestPasswordReset = (email: string) =>
  apiRequest<Record<string, never>>('POST', '/auth/password-reset/request', { body: { email } });
export const confirmPasswordReset = (email: string, code: string, password: string) =>
  apiRequest<Record<string, never>>('POST', '/auth/password-reset/confirm', {
    body: { email, code, password },
  });
