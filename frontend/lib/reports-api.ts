/*
 * Client of the report API (plan L6, S4). Contract: backend/openapi.yaml (tag Reports), served under /api/v1.
 *
 * POST /reports   body { questionId } or { replyId }, { reason }, { details? }   header Idempotency-Key
 *   201 ReportResponse { id, status: "open", createdAt }, with a Location header.
 *   400 not exactly one target, or an unknown reason. 403 account not active.
 *   404 the content is not visible to the viewer. 422 `other` without details, details over 280 characters,
 *   or the viewer's own content.
 *
 * As the other clients (lib/replies-api.ts), each function returns an ApiResult (lib/api-client.ts): the body on
 * success, the ApiProblem on any 4xx or 5xx answer. Nothing is thrown.
 */

import { questionLength } from '@/components/feed/question-rules';
import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

export const REPORT_DETAILS_MAX_LENGTH = 280;

/** The six reasons of a report, in the order of the menu (DEC-011). */
const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'illegal_content',
  'misinformation',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** What a report points at: one question, or one reply. */
export type ReportTarget = { questionId: string } | { replyId: string };

/** The report as the API answers it. A new report is always open. */
type ReportReceipt = {
  id: string;
  status: 'open';
  createdAt: string;
};

/** Number of characters of the details, as the counter shows it: code points, after trimming. */
export function reportDetailsLength(details: string): number {
  return questionLength(details);
}

/** The details are required for `other`, and at most REPORT_DETAILS_MAX_LENGTH characters once trimmed. */
export function isReportDetailsValid(reason: ReportReason, details: string): boolean {
  const length = reportDetailsLength(details);
  if (length > REPORT_DETAILS_MAX_LENGTH) {
    return false;
  }
  return reason !== 'other' || length >= 1;
}

/**
 * Sends a report. The caller keeps one Idempotency-Key per report until it succeeds, so a repeated submit, or a
 * connection that drops after the server recorded the report, does not create a second one (section 9.1).
 */
export function createReport(
  target: ReportTarget,
  reason: ReportReason,
  details: string | undefined,
  idempotencyKey: string,
): Promise<ApiResult<ReportReceipt>> {
  return protectedApiRequest<ReportReceipt>('POST', '/reports', {
    body: { ...target, reason, ...(details ? { details: details.trim() } : {}) },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
