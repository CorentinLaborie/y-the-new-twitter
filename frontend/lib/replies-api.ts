/*
 * Client of the reply API (M3, lot C): the replies under a question, and their reactions.
 * Contract: backend/openapi.yaml (tags Replies and ReplyReactions), served by the API under /api/v1.
 *
 * POST /questions/{questionId}/replies   body { text }   header Idempotency-Key
 *   201 ReplyView, with a Location header. 422 when the text is empty or over 280 characters.
 * GET /questions/{questionId}/replies[?cursor=…&limit=…]   200 ReplyPage, oldest first.
 *   limit: 1 to 50, default 20. cursor: the nextCursor of the previous page.
 * DELETE /replies/{replyId}                    204
 * PUT /replies/{replyId}/reactions/{kind}      200 ReplyReactionResult
 * DELETE /replies/{replyId}/reactions/{kind}   204, no body
 *   kind: like | dislike.
 *
 * The text is 1 to 280 characters, counted in Unicode code points (components/feed/question-rules.ts).
 * Unlike lib/feed-api.ts, which returns a result, the functions here return the value and throw the
 * ApiProblem (lib/api-client.ts) on any 4xx or 5xx answer.
 */

import { questionLength } from '@/components/feed/question-rules';
import { apiRequest } from '@/lib/api-client';

export const REPLY_MAX_LENGTH = 280;

export type ReplyReactionKind = 'like' | 'dislike';

/** The counters of a reply: the same fields in ReplyView.counters and in ReplyReactionResult.counts. */
type ReplyCounters = Record<ReplyReactionKind, number>;

/** A reply as the API sends it (ReplyResponseDto). */
export type ReplyView = {
  id: string;
  questionId: string;
  text: string;
  createdAt: string;
  author: { handle: string; displayName: string };
  counters: ReplyCounters;
  viewerReactions: ReplyReactionKind[];
};

/** One page of replies. `nextCursor` is null on the last page. */
export type ReplyPage = { items: ReplyView[]; nextCursor: string | null };

/** The answer to a reply reaction (ReplyReactionResponseDto). */
export type ReplyReactionResult = {
  replyId: string;
  counts: ReplyCounters;
  viewerReactions: ReplyReactionKind[];
};

/** Number of characters of a reply as the counter shows it: code points, after trimming (as a question). */
export function replyCharacterCount(text: string): number {
  return questionLength(text);
}

/** A reply is sent when, once trimmed, it has 1 to REPLY_MAX_LENGTH characters. */
export function isReplyTextValid(text: string): boolean {
  const length = replyCharacterCount(text);
  return length >= 1 && length <= REPLY_MAX_LENGTH;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** The body of a successful answer. Throws the ApiProblem otherwise; a 204 gives an empty body. */
async function callOrThrow<T>(
  method: Method,
  path: string,
  options?: { body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const result = await apiRequest<T>(method, path, options);
  if (!result.ok) {
    throw result.problem;
  }
  return result.body;
}

function repliesPath(questionId: string): string {
  return `/questions/${encodeURIComponent(questionId)}/replies`;
}

function replyPath(replyId: string): string {
  return `/replies/${encodeURIComponent(replyId)}`;
}

/**
 * Posts a reply to a question. The caller keeps one Idempotency-Key per text until the post succeeds, so a
 * repeated submit returns the first reply (section 9.1 of the product document).
 */
export function createReply(questionId: string, text: string, idempotencyKey: string): Promise<ReplyView> {
  return callOrThrow<ReplyView>('POST', repliesPath(questionId), {
    body: { text },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** One page of the replies of a question. Without `cursor` it is the first page; without `limit` the API uses 20. */
export function listReplies(
  questionId: string,
  { cursor, limit }: { cursor?: string; limit?: number } = {},
): Promise<ReplyPage> {
  const query = new URLSearchParams();
  if (cursor) {
    query.set('cursor', cursor);
  }
  if (limit !== undefined) {
    query.set('limit', String(limit));
  }
  const search = query.toString();
  return callOrThrow<ReplyPage>('GET', `${repliesPath(questionId)}${search ? `?${search}` : ''}`);
}

/** Deletes a reply of the signed-in account (204). */
export async function deleteReply(replyId: string): Promise<void> {
  await callOrThrow<void>('DELETE', replyPath(replyId));
}

/** Sets the viewer's reaction to `kind` on a reply, replacing the previous one. The answer carries the counters. */
export function setReplyReaction(replyId: string, kind: ReplyReactionKind): Promise<ReplyReactionResult> {
  return callOrThrow<ReplyReactionResult>('PUT', `${replyPath(replyId)}/reactions/${kind}`);
}

/** Removes the viewer's reaction of `kind` on a reply (204, no body). */
export async function removeReplyReaction(replyId: string, kind: ReplyReactionKind): Promise<void> {
  await callOrThrow<void>('DELETE', `${replyPath(replyId)}/reactions/${kind}`);
}
