/*
 * Client of the feed and question API (M2). Product reference: docs/y-product-and-web-documentation.md, section 9.2
 * ("GET /feed", "POST /questions", reactions); plan: docs/plans/M2-PLAN.md (B2, B3, B6, F3).
 * Contract: backend/openapi.yaml, served by the API under /api/v1.
 *
 * GET /feed?tab=for-you[&cursor=…]
 *   200 { trending, items, nextCursor }
 *   trending: the top 10 questions by reactions in the last 24 h, on the first page only (empty on the others).
 *   items: the list by date, the most recent first; on the first page it excludes the trending questions.
 *
 * POST /questions   body { text }   header Idempotency-Key
 *   201 FeedQuestion, with a Location header. 422 when the text is empty or over 280 characters.
 *   403 for an account that is not active (R13).
 *
 * PUT /questions/{id}/reactions/{kind}      200 with the counts after the reaction
 * DELETE /questions/{id}/reactions/{kind}   204, no body: the page keeps its own update
 *   kind: like | dislike | y. One reaction per user and question (R11): PUT replaces the previous one.
 *   403 for an account that is not active (R13). The page maps `counts` to `counters`.
 *
 * FeedQuestion = {
 *   id, text, hashtags, createdAt (ISO 8601, UTC), author: { handle, displayName },
 *   counters: { like, dislike, y, reply },
 *   yThreshold: number          the Y count that opens the conversation (R3): the page shows counters.y / yThreshold
 *   conversationOpen: boolean   true once the Y count has reached yThreshold; it stays true
 *   viewerReactions: ReactionKind[]   the reactions of the signed-in user: at most one (R11)
 * }
 *
 * The text is 1 to 280 characters, counted in Unicode code points (components/feed/question-rules.ts).
 * Errors are Problem Details, read as ApiProblem (lib/api-client.ts).
 */

import { apiRequest, type ApiProblem } from '@/lib/api-client';

export type ReactionKind = 'like' | 'dislike' | 'y';

type ReactionCounters = Record<ReactionKind, number>;

/** The reactions of a question as the page shows them: the same fields as a FeedQuestion, without the text. */
export type ReactionState = {
  counters: ReactionCounters;
  yThreshold: number;
  conversationOpen: boolean;
  viewerReactions: ReactionKind[];
};

export type FeedQuestion = ReactionState & {
  id: string;
  text: string;
  hashtags: string[];
  createdAt: string;
  author: { handle: string; displayName: string };
};

/** One page of the feed. `trending` (the top 10 by reactions in the last 24 h) is sent on the first page only. */
export type FeedPage = { trending: FeedQuestion[]; items: FeedQuestion[]; nextCursor: string | null };

export type FeedResult<T> = { ok: true; body: T } | { ok: false; problem: ApiProblem };

/** One page of the "Pour vous" feed. `cursor` is the nextCursor of the previous page, absent for the first one. */
export function fetchFeedPage(cursor?: string): Promise<FeedResult<FeedPage>> {
  const query = new URLSearchParams({ tab: 'for-you' });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return apiRequest<FeedPage>('GET', `/feed?${query.toString()}`);
}

/**
 * Posts a question. The key makes a repeated submit return the first result (Idempotency-Key, section 9.1);
 * the composer keeps one key per text until the post succeeds.
 */
export function postQuestion(text: string, idempotencyKey: string): Promise<FeedResult<FeedQuestion>> {
  return apiRequest<FeedQuestion>('POST', '/questions', {
    body: { text },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** The reaction answer as the API sends it (section 9.3): the counts come as `counts`. */
type ReactionAnswer = {
  questionId: string;
  counts: ReactionCounters;
  viewerReactions: ReactionKind[];
  yThreshold: number;
  conversationOpen: boolean;
};

/** The page's name for the answer's fields: `counts` becomes `counters`. Empty when the answer has no body (204). */
function toReactionState(answer: Partial<ReactionAnswer>): Partial<ReactionState> {
  if (!answer.counts) {
    return {};
  }
  return {
    counters: answer.counts,
    viewerReactions: answer.viewerReactions,
    yThreshold: answer.yThreshold,
    conversationOpen: answer.conversationOpen,
  };
}

async function reactionCall(
  method: 'PUT' | 'DELETE',
  questionId: string,
  kind: ReactionKind,
): Promise<FeedResult<Partial<ReactionState>>> {
  const result = await apiRequest<Partial<ReactionAnswer>>(
    method,
    `/questions/${encodeURIComponent(questionId)}/reactions/${kind}`,
  );
  return result.ok ? { ok: true, body: toReactionState(result.body) } : result;
}

/** Sets the viewer's reaction to `kind` on a question, replacing the previous one (R11). The answer is the state. */
export function putReaction(
  questionId: string,
  kind: ReactionKind,
): Promise<FeedResult<Partial<ReactionState>>> {
  return reactionCall('PUT', questionId, kind);
}

/** Removes the viewer's reaction of `kind` on a question. The API answers 204: the page keeps its own update. */
export function deleteReaction(
  questionId: string,
  kind: ReactionKind,
): Promise<FeedResult<Partial<ReactionState>>> {
  return reactionCall('DELETE', questionId, kind);
}
