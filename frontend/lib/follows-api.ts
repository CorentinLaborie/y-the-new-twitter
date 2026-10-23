/*
 * Client of the follow calls (L3, plan L3-SUBSCRIPTIONS-PLAN, section 6.2: E1 and E2). Product reference:
 * docs/y-product-and-web-documentation.md, section 9.2. Contract: backend/openapi.yaml, served by the API under /api/v1.
 *
 * PUT /users/{handle}/follow
 *   200 { handle, viewerFollows: true }. Idempotent: following an account already followed changes nothing.
 *   404 unknown, suspended, deleted or blocked account. 422 following oneself. 403 for an account that is not active (R13).
 * DELETE /users/{handle}/follow
 *   204, no body. Idempotent: unfollowing an account not followed changes nothing.
 *   404 unknown account only. 403 for an account that is not active (R13).
 *
 * Errors are Problem Details, read as ApiProblem (lib/api-client.ts). The CSRF token of the mutations is sent by
 * apiRequest (X-CSRF-Token). No Idempotency-Key: the calls are idempotent by themselves.
 */

import type { ApiProblem, ApiResult } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import { protectedApiRequest } from '@/lib/session-expired';

/** The answer of PUT: the account and whether the viewer follows it after the call. */
export type FollowState = { handle: string; viewerFollows: boolean };

function followPath(handle: string): string {
  return `/users/${encodeURIComponent(handle)}/follow`;
}

/** Follows an account. Following it again changes nothing on the server. */
export function followUser(handle: string): Promise<ApiResult<FollowState>> {
  return protectedApiRequest<FollowState>('PUT', followPath(handle));
}

/** Stops following an account. The API answers 204: the button keeps its own state. */
export function unfollowUser(handle: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('DELETE', followPath(handle));
}

/**
 * The French message under a follow button whose call failed (the button has been rolled back). A known code gives its
 * text from lib/api-messages.ts; otherwise the status decides. `following` is the state the viewer asked for.
 */
export function followFailureMessage(problem: ApiProblem, following: boolean): string {
  const coded = messageForCode(problem);
  if (coded !== null) {
    return coded;
  }
  if (problem.status === 404) {
    return 'Compte introuvable.';
  }
  if (problem.status === 403) {
    return 'Votre compte n’est pas actif : vous ne pouvez pas modifier vos suivis pour le moment.';
  }
  return following
    ? 'Le suivi n’a pas été enregistré. Réessayez.'
    : 'Le suivi n’a pas pu être retiré. Réessayez.';
}
