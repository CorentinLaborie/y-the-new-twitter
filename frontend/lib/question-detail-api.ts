/*
 * Client of the share view of one question (M3, lot C, F11): GET /questions/{questionId}.
 * Contract: backend/openapi.yaml (QuestionResponseDto, QuestionCountersDto), served by the API under /api/v1.
 *
 * GET /questions/{questionId}
 *   200 the question, as the feed returns it, with the reply counter (counters.reply).
 *   400 when the id is not a UUID. 404 when the question does not exist, is hidden or is deleted.
 *
 * Like lib/replies-api.ts, the function returns an ApiResult (lib/api-client.ts): the body on success, the
 * ApiProblem on any 4xx or 5xx answer, so the share view can tell a 404 from the other errors.
 */

import type { ApiResult } from '@/lib/api-client';
import type { FeedQuestion } from '@/lib/feed-api';
import { protectedApiRequest } from '@/lib/session-expired';

/** A FeedQuestion whose counters also carry the reply count (QuestionCountersDto). */
type QuestionDetail = FeedQuestion & {
  counters: FeedQuestion['counters'] & { reply: number };
};

/** One question, for the share view. The ApiProblem comes back when the API refuses it (404 when unavailable). */
export function getQuestion(questionId: string): Promise<ApiResult<QuestionDetail>> {
  return protectedApiRequest<QuestionDetail>('GET', `/questions/${encodeURIComponent(questionId)}`);
}
