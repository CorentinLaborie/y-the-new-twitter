import { Injectable } from '@nestjs/common';
import type { Prisma, ReactionKind } from '../database/generated/client/client';
import { visibleTo } from '../questions/question-view';

/** The Prisma client or a transaction opened by the service. */
export type ReactionsDb = Prisma.TransactionClient;

/** Change of the three reaction counters of a question. */
export interface CounterChange {
  readonly like: number;
  readonly dislike: number;
  readonly y: number;
}

/** The only place that writes question reactions and their counters (section 8.2). */
@Injectable()
export class ReactionsRepository {
  /**
   * Locks the question row until the transaction ends. Reactions on one question run one at a time, so the
   * counters match the rows even under concurrent requests (B4).
   */
  async lockQuestion(db: ReactionsDb, questionId: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM questions WHERE id = ${questionId}::uuid FOR UPDATE`;
  }

  /** The question, when this viewer may see it (visibleTo: hidden, deleted, inactive or blocked is not found). */
  findVisibleQuestion(db: ReactionsDb, viewerId: string, questionId: string) {
    return db.question.findFirst({
      where: { AND: [{ id: questionId }, visibleTo(viewerId)] },
      select: { id: true },
    });
  }

  findCounters(db: ReactionsDb, questionId: string) {
    return db.question.findUniqueOrThrow({
      where: { id: questionId },
      select: { likeCount: true, dislikeCount: true, yCount: true, conversationOpenedAt: true },
    });
  }

  /** Opens the conversation once: the first time the Y count reaches the threshold (R3). Later drops do not close it. */
  openConversation(db: ReactionsDb, questionId: string, at: Date) {
    return db.question.updateMany({
      where: { id: questionId, conversationOpenedAt: null },
      data: { conversationOpenedAt: at },
    });
  }

  findReaction(db: ReactionsDb, userId: string, questionId: string) {
    return db.questionReaction.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { kind: true },
    });
  }

  /** One reaction per user and question (R11). A new kind replaces the previous row; its date stays the day it was placed (DEC-164). */
  setReaction(db: ReactionsDb, userId: string, questionId: string, kind: ReactionKind) {
    return db.questionReaction.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId, kind },
      update: { kind },
    });
  }

  removeReaction(db: ReactionsDb, userId: string, questionId: string) {
    return db.questionReaction.delete({ where: { userId_questionId: { userId, questionId } } });
  }

  changeCounters(db: ReactionsDb, questionId: string, change: CounterChange) {
    return db.question.update({
      where: { id: questionId },
      data: {
        likeCount: { increment: change.like },
        dislikeCount: { increment: change.dislike },
        yCount: { increment: change.y },
      },
    });
  }
}
