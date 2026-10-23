import { Injectable } from '@nestjs/common';
import type { Prisma, ReportReason } from '../database/generated/client/client';
import { visibleTo } from '../questions/question-view';
import { visibleReplyTo } from '../replies/reply-view';

/** The Prisma client or a transaction opened by the service. */
export type ReportsDb = Prisma.TransactionClient;

/** The only place that reads and writes the reports table (section 8.2). */
@Injectable()
export class ReportsRepository {
  /** The question, when this viewer may see it. A hidden, deleted, inactive or blocked question is not found. */
  findVisibleQuestion(db: ReportsDb, viewerId: string, questionId: string) {
    return db.question.findFirst({
      where: { AND: [{ id: questionId }, visibleTo(viewerId)] },
      select: { id: true, authorId: true },
    });
  }

  /** The reply, when this viewer may see it (same rule as the reply list, DEC-190). */
  findVisibleReply(db: ReportsDb, viewerId: string, replyId: string) {
    return db.reply.findFirst({
      where: { AND: [{ id: replyId }, visibleReplyTo(viewerId)] },
      select: { id: true, authorId: true },
    });
  }

  /** One row per report: the same account may report the same content several times (DEC, plan section 6). */
  createReport(
    db: ReportsDb,
    data: {
      reporterId: string;
      questionId: string | null;
      replyId: string | null;
      reason: ReportReason;
      details: string | null;
    },
  ) {
    return db.report.create({ data, select: { id: true, createdAt: true } });
  }
}
