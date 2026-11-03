/*
 * Client of the mention selector (section M3): the accounts proposed for a handle typed after an '@'.
 * Contract: backend/openapi.yaml, served by the API under /api/v1.
 *
 * GET /mentions/suggestions?q=…   200 { items: [{ handle, displayName }] }, at most five accounts.
 *   q: the handle typed so far, up to 30 letters, digits or underscores, possibly empty.
 *   The accounts are the ones the viewer follows or that follow the viewer, visible to them: a banned, deleted or
 *   blocked account is never proposed.
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

/** An account the selector proposes. */
export type MentionSuggestion = { handle: string; displayName: string; avatarUrl: string | null };

/** The answer of the selector: the accounts in the order to show them. */
type MentionSuggestionPage = { items: MentionSuggestion[] };

/** The accounts proposed for the handle typed so far. */
export function fetchMentionSuggestions(query: string): Promise<ApiResult<MentionSuggestionPage>> {
  const search = new URLSearchParams({ q: query });
  return protectedApiRequest<MentionSuggestionPage>('GET', `/mentions/suggestions?${search.toString()}`);
}
