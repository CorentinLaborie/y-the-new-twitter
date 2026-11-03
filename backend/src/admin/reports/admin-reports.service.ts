import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../common/pagination/keyset-cursor';
import type { ReportDecision, ReportStatus } from '../../database/generated/client/client';
import { AuditLogService } from '../audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-log.types';
import {
  AdminReportsRepository,
  type ContentReportRow,
  type ReportRow,
  type ReportTarget,
} from './admin-reports.repository';
import type {
  ReportDecisionName,
  ReportDecisionResult,
  ReportDetailView,
  ReportListItem,
  ReportListOptions,
  ReportListStatus,
  ReportOnContentView,
  ReportPage,
  ReportRestoreResult,
  ReportTargetType,
  ReportTargetView,
} from './admin-reports.types';

/** The reported content as the repository reads it (a question or a reply, with its author). */
type TargetContent = NonNullable<ReportRow['question']>;

const NOT_FOUND_MESSAGE = 'Signalement introuvable.';
const ALREADY_DECIDED_MESSAGE = 'Ce signalement a déjà été traité.';
const NOT_HIDDEN_MESSAGE = 'Ce contenu n’est pas masqué : rien à restaurer.';

/** The status and the decision that each decision gives the report (see the report model in the schema). */
const DECISION_PLANS: Record<
  ReportDecisionName,
  { status: 'resolved' | 'dismissed'; decision: ReportDecision }
> = {
  hide: { status: 'resolved', decision: 'content_hidden' },
  dismiss: { status: 'dismissed', decision: 'no_action' },
};

/**
 * The reports of the back-office (section 3.5): the list, the report with its content, and the decision on it. The
 * decision is audited in the same transaction, and needs a re-authentication (the route checks it). The e-mail address
 * of the author is never read here.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly repository: AdminReportsRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** One page of reports, newest first. The cursor is opaque; nextCursor is null on the last page. */
  async list(options: ReportListOptions): Promise<ReportPage> {
    const after = options.cursor === undefined ? undefined : decodeKeysetCursor(options.cursor);
    const rows = await this.repository.page({
      after,
      limit: options.limit + 1,
      status: statusesOf(options.status),
      reason: options.reason,
    });

    const pageRows = rows.slice(0, options.limit);
    const hasMore = rows.length > options.limit;
    const counts = await this.countReportsPerContent(pageRows);
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row) => toListItem(row, counts.get(contentKey(row)) ?? 0)),
      nextCursor:
        hasMore && last !== undefined ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  /** One report, with the content it is about and the reports made on that content. Unknown ids answer 404. */
  async view(id: string): Promise<ReportDetailView> {
    const row = await this.repository.findById(id);
    if (row === null) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    const reports = await this.repository.reportsOnContent(targetOf(row));
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      reason: row.reason,
      status: row.status,
      decision: row.decision,
      decisionNote: row.decisionNote,
      decidedAt: row.reviewedAt?.toISOString() ?? null,
      target: toTargetView(row),
      reports: reports.map(toContentReportView),
    };
  }

  /**
   * Decides on an open report: 'hide' hides the content and closes the open reports on it, 'dismiss' closes this report
   * only. A report already decided answers 409. The decision is audited with the note as its reason.
   */
  async decide(
    actorId: string,
    id: string,
    request: { decision: ReportDecisionName; note: string },
    now: Date,
  ): Promise<ReportDecisionResult> {
    const row = await this.repository.findById(id);
    if (row === null) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    if (row.status !== 'open') {
      throw new ConflictException(ALREADY_DECIDED_MESSAGE);
    }

    const plan = DECISION_PLANS[request.decision];
    const note = request.note;
    const decided = await this.repository.decide({
      reportId: id,
      target: targetOf(row),
      now,
      reviewedById: actorId,
      status: plan.status,
      decision: plan.decision,
      note,
      record: (db) =>
        this.audit.appendIn(db, {
          actorId,
          action: AUDIT_ACTIONS.reportDecide,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.report,
          targetId: id,
          reason: note,
          details: { decision: request.decision },
        }),
    });
    if (!decided) {
      // Another administrator decided first: nothing was written.
      throw new ConflictException(ALREADY_DECIDED_MESSAGE);
    }

    return { id, status: plan.status, decision: plan.decision, decidedAt: now.toISOString() };
  }

  /**
   * Restores the content of a report that was hidden by a decision: the content is visible again, for its author and for
   * everyone. Only a report whose decision hid the content can restore it; otherwise, or when the content is no longer
   * hidden, the answer is 409. The restoration is audited with the note as its reason (L7, admin only).
   */
  async restore(
    actorId: string,
    id: string,
    request: { note: string },
    now: Date,
  ): Promise<ReportRestoreResult> {
    const row = await this.repository.findById(id);
    if (row === null) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    if (row.decision !== 'content_hidden') {
      throw new ConflictException(NOT_HIDDEN_MESSAGE);
    }

    const restored = await this.repository.restore({
      target: targetOf(row),
      now,
      record: (db) =>
        this.audit.appendIn(db, {
          actorId,
          action: AUDIT_ACTIONS.reportRestore,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.report,
          targetId: id,
          reason: request.note,
          details: {},
        }),
    });
    if (!restored) {
      throw new ConflictException(NOT_HIDDEN_MESSAGE);
    }

    return { id, restoredAt: now.toISOString() };
  }

  /** The number of reports made on each content of the page, counted over all the reports of that content. */
  private async countReportsPerContent(rows: ReportRow[]): Promise<Map<string, number>> {
    const reports: ReportTarget[] = await this.repository.reportsOn({
      questionIds: uniqueIds(rows.map((row) => row.questionId)),
      replyIds: uniqueIds(rows.map((row) => row.replyId)),
    });

    const counts = new Map<string, number>();
    for (const report of reports) {
      const key = contentKey(report);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
}

/** The status filter as the repository reads it: open, or the two decided statuses. Absent: every status. */
function statusesOf(status: ReportListStatus | undefined): ReportStatus[] | undefined {
  switch (status) {
    case 'open':
      return ['open'];
    case 'decided':
      return ['resolved', 'dismissed'];
    case undefined:
      return undefined;
  }
}

function targetOf(row: ReportRow): ReportTarget {
  return { questionId: row.questionId, replyId: row.replyId };
}

/** The key of a content in the counts: a question and a reply can share no id, but the kind is kept anyway. */
function contentKey(target: ReportTarget): string {
  return target.questionId !== null ? `question:${target.questionId}` : `reply:${target.replyId}`;
}

function uniqueIds(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function toTargetView(row: ReportRow): ReportTargetView {
  if (row.question !== null) {
    return toTargetRow('question', row.question);
  }
  if (row.reply !== null) {
    return toTargetRow('reply', row.reply);
  }
  throw new Error(`The report ${row.id} has no content.`);
}

function toTargetRow(type: ReportTargetType, content: TargetContent): ReportTargetView {
  return {
    type,
    id: content.id,
    body: content.body,
    authorHandle: content.author.handle,
    authorDisplayName: content.author.displayName,
    authorAvatarUrl: content.author.avatarUrl,
    moderationStatus: content.moderationStatus,
    createdAt: content.createdAt.toISOString(),
  };
}

function toListItem(row: ReportRow, reportCount: number): ReportListItem {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    status: row.status,
    target: toTargetView(row),
    reportCount,
  };
}

function toContentReportView(row: ContentReportRow): ReportOnContentView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    details: row.details,
    status: row.status,
  };
}
