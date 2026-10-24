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

/** The reasons of a deletion, as the administrator's list (backend/src/admin/users/account-deletion-reasons.ts). */
export const DELETION_REASONS = [
  { value: 'abuse', label: 'Abus' },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'identity_theft', label: 'Usurpation d’identité' },
  { value: 'other', label: 'Autre' },
] as const;

export type DeletionReasonCode = (typeof DELETION_REASONS)[number]['value'];

export type AccountDeletionRequest = {
  password: string;
  reasonCode: DeletionReasonCode;
  otherReason?: string;
  email: string;
};

/** The answer to a deletion request: the date the account is purged. */
export type AccountDeletionReceipt = { deletionPurgeAt: string };

/**
 * Asks for the deletion of the account (200, the purge date). The session is closed by the server: the caller shows the
 * answer on the same page and sends the visitor to the login page when they choose to.
 */
export function requestAccountDeletion(request: AccountDeletionRequest): Promise<ApiResult<AccountDeletionReceipt>> {
  return protectedApiRequest<AccountDeletionReceipt>('PUT', '/users/me/deletion', { body: request });
}

/** The notification types a preference can be set for (backend NotificationType). */
export type NotificationPreferenceType =
  | 'reply_to_question'
  | 'conversation_opened'
  | 'reaction_like'
  | 'reaction_dislike'
  | 'reaction_y'
  | 'follow'
  | 'mention';

/** One stored preference. A type without a row is on (the default). */
export type NotificationPreference = { type: NotificationPreferenceType; enabled: boolean };

/** The stored preferences of the viewer (plan L5, step 8). */
export function getNotificationPreferences(): Promise<ApiResult<{ items: NotificationPreference[] }>> {
  return protectedApiRequest<{ items: NotificationPreference[] }>('GET', '/notification-preferences');
}

/** Switches one notification type on or off (200, the value as stored). */
export function setNotificationPreference(
  type: NotificationPreferenceType,
  enabled: boolean,
): Promise<ApiResult<NotificationPreference>> {
  return protectedApiRequest<NotificationPreference>('PUT', `/notification-preferences/${type}`, { body: { enabled } });
}
