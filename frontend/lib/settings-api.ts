/*
 * Client of the settings API (plan L5). Contract: backend/openapi.yaml, served under /api/v1.
 *
 * GET /users/me/account   200 AccountSettings. 401 without a session, 403 when the account is not active.
 *
 * Each function returns an ApiResult (lib/api-client.ts): the body on success, the ApiProblem on any 4xx or 5xx
 * answer. Nothing is thrown. The calls go through protectedApiRequest, so a 401 sends the visitor to the login page.
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

/** The account of the signed-in viewer, as the settings page shows it. `deletionPurgeAt` is null outside a deletion. */
export type AccountSettings = {
  handle: string;
  displayName: string;
  email: string;
  status: string;
  deletionPurgeAt: string | null;
};

/** The account of the viewer: handle, name, e-mail, status and the purge date of a pending deletion. */
export function getAccount(): Promise<ApiResult<AccountSettings>> {
  return protectedApiRequest<AccountSettings>('GET', '/users/me/account');
}

/**
 * Changes the password of the signed-in account (204). The other sessions are closed; the current one stays open. The
 * caller checks the confirmation and the policy before the call: the server stays the reference (plan L5, 6.2).
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('PUT', '/users/me/password', { body: { currentPassword, newPassword } });
}

/**
 * Asks for a change of address: the code goes to the new address (202, whatever the outcome on the server, so the
 * answer reveals nothing). A wrong password is 422.
 */
export function requestEmailChange(newEmail: string, password: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('POST', '/auth/email-change/request', { body: { newEmail, password } });
}

/** Sends the open code to the new address again (202). Beyond three resends an hour the answer is 429. */
export function resendEmailChange(): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('POST', '/auth/email-change/resend');
}

/** Confirms the change with the six-digit code (200). 422 for a wrong or expired code, 409 when the address is taken. */
export function confirmEmailChange(code: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('POST', '/auth/email-change/confirm', { body: { code } });
}
