import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../../common/pagination/keyset-cursor';
import {
  Prisma,
  type ReportDecision,
  type ReportReason,
  type ReportStatus,
} from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuditDb } from '../audit/audit-log.repository';

/** The reported content, with the handle and the display name of its author. */
const TARGET_SELECT = {
  id: true,
  body: true,
  moderationStatus: true,
  createdAt: true,
  author: { select: { handle: true, displayName: true, avatarUrl: true } },
} as const;

const REPORT_SELECT = {
  id: true,
  createdAt: true,
  reason: true,
  status: true,
  decision: true,
  decisionNote: true,
  reviewedAt: true,
  questionId: true,
  replyId: true,
  question: { select: TARGET_SELECT },
  reply: { select: TARGET_SELECT },
} satisfies Prisma.ReportSelect;

/** A report as the database returns it, with the question or the reply it is about. */
export type ReportRow = Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>;

/** A report made on the content, as the detail lists it. The reporter is not read. */
export interface ContentReportRow {
  id: string;
  createdAt: Date;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
}

/** The content a report is about: exactly one of the two ids is set. */
export interface ReportTarget {
  questionId: string | null;
  replyId: string | null;
}

/** One decision on a report, as the repository writes it. The rules that choose it are in the service. */
export interface ReportDecisionWrite {
  reportId: string;
  target: ReportTarget;
  now: Date;
  reviewedById: string;
  /** The status the decided report takes: resolved (the content is hidden) or dismissed. */
  status: 'resolved' | 'dismissed';
  decision: ReportDecision;
  note: string;
  /** Writes the audit entry inside the same transaction: if it fails, the decision is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/** One restoration of hidden content, as the repository writes it. The audit entry is written in the same transaction. */
export interface ReportRestoreWrite {
  target: ReportTarget;
  now: Date;
  /** Writes the audit entry inside the same transaction: if it fails, the restoration is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/**
 * The back-office reads of the reports (section 3.5), and the decisions on them. The only place that writes the
 * reports and the moderation status of the questions and replies from the back-office.
 */
@Injectable()
export class AdminReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A page of reports, newest first, strictly after `after` when it is given. */
  page(options: {
    after?: KeysetPosition;
    limit: number;
    status?: ReportStatus[];
    reason?: ReportReason;
  }): Promise<ReportRow[]> {
    const conditions: Prisma.ReportWhereInput[] = [];
    if (options.status !== undefined) {
      conditions.push({ status: { in: options.status } });
    }
    if (options.reason !== undefined) {
      conditions.push({ reason: options.reason });
    }
    if (options.after !== undefined) {
      const { createdAt, id } = options.after;
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }

    return this.prisma.report.findMany({
      where: { AND: conditions },
      select: REPORT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
    });
  }

  /** The targets of the reports made on the given contents: used to count the reports of each content. */
  reportsOn(targets: { questionIds: string[]; replyIds: string[] }): Promise<ReportTarget[]> {
    if (targets.questionIds.length === 0 && targets.replyIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.report.findMany({
      where: {
        OR: [{ questionId: { in: targets.questionIds } }, { replyId: { in: targets.replyIds } }],
      },
      select: { questionId: true, replyId: true },
    });
  }

  findById(id: string): Promise<ReportRow | null> {
    return this.prisma.report.findUnique({ where: { id }, select: REPORT_SELECT });
  }

  /** The reports made on the content of one report, newest first. */
  reportsOnContent(target: ReportTarget): Promise<ContentReportRow[]> {
    return this.prisma.report.findMany({
      where: target.questionId !== null ? { questionId: target.questionId } : { replyId: target.replyId },
      select: { id: true, createdAt: true, reason: true, details: true, status: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * Writes one decision in one transaction. A hidden content is hidden for everyone (its moderation status), and the open
   * reports on it are closed with it. False, with no write, when the report is no longer open.
   */
  decide(change: ReportDecisionWrite): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.report.updateMany({
        where: { id: change.reportId, status: 'open' },
        data: {
          status: change.status,
          decision: change.decision,
          decisionNote: change.note,
          reviewedAt: change.now,
          reviewedById: change.reviewedById,
        },
      });
      if (result.count !== 1) {
        return false;
      }

      if (change.decision === 'content_hidden') {
        await tx.report.updateMany({
          where: {
            status: 'open',
            ...(change.target.questionId !== null
              ? { questionId: change.target.questionId }
              : { replyId: change.target.replyId }),
          },
          data: {
            status: 'resolved',
            decision: 'content_hidden',
            reviewedAt: change.now,
            reviewedById: change.reviewedById,
          },
        });
        const moderation = { moderationStatus: 'hidden' as const, moderatedAt: change.now };
        if (change.target.questionId !== null) {
          await tx.question.update({ where: { id: change.target.questionId }, data: moderation });
        } else if (change.target.replyId !== null) {
          await tx.reply.update({ where: { id: change.target.replyId }, data: moderation });
        }
      }

      await change.record(tx);
      return true;
    });
  }

  /**
   * Makes a hidden content visible again, in one transaction. The reports that closed with the hiding stay decided, as
   * their history. False, with no write, when the content is not hidden any more (another administrator restored it).
   */
  restore(change: ReportRestoreWrite): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const moderation = { moderationStatus: 'visible' as const, moderatedAt: change.now };
      const hidden = { moderationStatus: 'hidden' as const };
      const result =
        change.target.questionId !== null
          ? await tx.question.updateMany({
              where: { id: change.target.questionId, ...hidden },
              data: moderation,
            })
          : await tx.reply.updateMany({
              where: { id: change.target.replyId ?? '', ...hidden },
              data: moderation,
            });
      if (result.count !== 1) {
        return false;
      }

      await change.record(tx);
      return true;
    });
  }
}
