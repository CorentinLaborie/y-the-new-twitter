/*
 * Client of the saved questions (L4, plan L4-BOOKMARKS-PLAN, section 6). Contract: backend/openapi.yaml, served by the
 * API under /api/v1.
 *
 * PUT /questions/{questionId}/bookmark
 *   200 { questionId, saved: true }. Idempotent: saving a saved question changes nothing.
 *   404 unknown, hidden, deleted, or blocked question. 403 for an account that is not active (R13).
 * DELETE /questions/{questionId}/bookmark
 *   204, no body. Idempotent: removing a question that is not saved changes nothing.
 * GET /bookmarks?cursor=…&limit=…
 *   200 { questions, nextCursor }: the saved questions, the most recent save first (section 9.1).
 *
 * Errors are Problem Details, read as ApiProblem (lib/api-client.ts). The CSRF token of the mutations is sent by
 * protectedApiRequest. No Idempotency-Key: the calls are idempotent by themselves.
 */

import type { ApiProblem, ApiResult } from '@/lib/api-client';
import { messageForCode } from '@/lib/api-messages';
import { protectedApiRequest } from '@/lib/session-expired';
import type { FeedQuestion } from '@/lib/feed-api';

/** The answer of PUT: the question and its save state after the call. */
export type BookmarkState = { questionId: string; saved: true };

/** One page of the saved questions. `nextCursor` is null on the last page. `total` counts every saved question (L4). */
export type BookmarkPage = { questions: FeedQuestion[]; nextCursor: string | null; total: number };

/** What the list asks for: the page after a cursor, and a search (blank or absent means none). */
export type BookmarkPageOptions = { cursor?: string; search?: string };

function bookmarkPath(questionId: string): string {
  return `/questions/${encodeURIComponent(questionId)}/bookmark`;
}

/** Saves a question. Saving it again changes nothing on the server. */
export function saveQuestion(questionId: string): Promise<ApiResult<BookmarkState>> {
  return protectedApiRequest<BookmarkState>('PUT', bookmarkPath(questionId));
}

/** Removes a question from the saved list. The API answers 204: the button keeps its own state. */
export function unsaveQuestion(questionId: string): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('DELETE', bookmarkPath(questionId));
}

/**
 * The French message under a save button whose call failed (the button has been rolled back). A known code gives its
 * text from lib/api-messages.ts; otherwise the status decides. `saving` is the state the viewer asked for.
 */
export function bookmarkFailureMessage(problem: ApiProblem, saving: boolean): string {
  const coded = messageForCode(problem);
  if (coded !== null) {
    return coded;
  }
  if (problem.status === 404) {
    return 'Cette question n’est plus disponible.';
  }
  if (problem.status === 403) {
    return 'Votre compte n’est pas actif : vous ne pouvez pas modifier vos signets pour le moment.';
  }
  return saving
    ? 'La question n’a pas été enregistrée. Réessayez.'
    : 'La question n’a pas pu être retirée des signets. Réessayez.';
}

/** One page of the saved questions, after the cursor of the previous page, and filtered by the search when one is given. */
export function fetchBookmarkPage(options: BookmarkPageOptions = {}): Promise<ApiResult<BookmarkPage>> {
  const params = new URLSearchParams();
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  const search = options.search?.trim() ?? '';
  if (search !== '') {
    params.set('q', search);
  }
  const query = params.toString();
  return protectedApiRequest<BookmarkPage>('GET', `/bookmarks${query === '' ? '' : `?${query}`}`);
}
