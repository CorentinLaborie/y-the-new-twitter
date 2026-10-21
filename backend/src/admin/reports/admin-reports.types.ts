import type {
  ModerationStatus,
  ReportDecision,
  ReportReason,
  ReportStatus,
} from '../../database/generated/client/client';

/** The filter of the report list: the open reports, or the decided ones (resolved or dismissed). Absent: all. */
export type ReportListStatus = 'open' | 'decided';

/** The kind of content a report is about. */
export type ReportTargetType = 'question' | 'reply';

/** The reported content, as the back-office shows it: its author's handle, never the e-mail address. Times are ISO. */
export interface ReportTargetView {
  type: ReportTargetType;
  id: string;
  body: string;
  authorHandle: string;
  authorDisplayName: string;
  moderationStatus: ModerationStatus;
  createdAt: string;
}

/** One report of the list. reportCount is the number of reports made on the same content. */
export interface ReportListItem {
  id: string;
  createdAt: string;
  reason: ReportReason;
  status: ReportStatus;
  target: ReportTargetView;
  reportCount: number;
}

/** One page of the report list, newest first. nextCursor is null on the last page. */
export interface ReportPage {
  items: ReportListItem[];
  nextCursor: string | null;
}

/** A report made on the content, without its reporter. */
export interface ReportOnContentView {
  id: string;
  createdAt: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
}

/** One report, with the reported content and the reports made on that content. */
export interface ReportDetailView {
  id: string;
  createdAt: string;
  reason: ReportReason;
  status: ReportStatus;
  decision: ReportDecision | null;
  decisionNote: string | null;
  decidedAt: string | null;
  target: ReportTargetView;
  reports: ReportOnContentView[];
}

/** The answer of PUT /admin/reports/{id}/decision. */
export interface ReportDecisionResult {
  id: string;
  status: ReportStatus;
  decision: ReportDecision;
  decidedAt: string;
}

export type ReportDecisionName = 'hide' | 'dismiss';

export interface ReportListOptions {
  /** Absent: every report. */
  status?: ReportListStatus;
  /** Absent: every reason. */
  reason?: ReportReason;
  cursor?: string;
  /** Between 1 and 50. */
  limit: number;
}
