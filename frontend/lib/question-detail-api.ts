/*
 * Client of the share view of one question (M3, lot C, F11): GET /questions/{questionId}.
 * Contract: backend/openapi.yaml (QuestionResponseDto, QuestionCountersDto), served by the API under /api/v1.
 *
 * GET /questions/{questionId}
 *   200 the question, as the feed returns it, with the reply counter (counters.reply).
 *   400 when the id is not a UUID. 404 when the question does not exist, is hidden or is deleted.
 *
 * Like lib/replies-api.ts, the function returns the value and throws the ApiProblem (lib/api-client.ts)
 * on any 4xx or 5xx answer, so the share view can tell a 404 from the other errors.
 */

import { apiRequest } from '@/lib/api-client';
import type { FeedQuestion } from '@/lib/feed-api';

/** A FeedQuestion whose counters also carry the reply count (QuestionCountersDto). */
export type QuestionDetail = FeedQuestion & {
  counters: FeedQuestion['counters'] & { reply: number };
};

/** One question, for the share view. Throws the ApiProblem when the API refuses it (404 when unavailable). */
export async function getQuestion(questionId: string): Promise<QuestionDetail> {
  const result = await apiRequest<QuestionDetail>('GET', `/questions/${encodeURIComponent(questionId)}`);
  if (!result.ok) {
    throw result.problem;
  }
  return result.body;
}
