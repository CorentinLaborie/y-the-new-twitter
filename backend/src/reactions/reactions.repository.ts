import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma, ReactionKind } from '../database/generated/client/client';
import { visibleTo } from '../questions/question-view';

/** The Prisma client or a transaction opened by the service. */
export type ReactionsDb = Prisma.TransactionClient;

/** The notification type written for each reaction kind (L2). */
const REACTION_NOTIFICATION: Record<ReactionKind, NotificationType> = {
  like: 'reaction_like',
  dislike: 'reaction_dislike',
  y: 'reaction_y',
};

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

  findQuestionCounters(db: ReactionsDb, questionId: string) {
    return db.question.findUniqueOrThrow({
      where: { id: questionId },
      select: {
        authorId: true,
        likeCount: true,
        dislikeCount: true,
        yCount: true,
        conversationOpenedAt: true,
      },
    });
  }

  /** Opens the conversation once: the first time the Y count reaches the threshold (R3). Later drops do not close it. */
  openConversation(db: ReactionsDb, questionId: string, at: Date) {
    return db.question.updateMany({
      where: { id: questionId, conversationOpenedAt: null },
      data: { conversationOpenedAt: at },
    });
  }

  /** The notice to the author of a question when another account reacts with one kind (section 4.1 of the L2 plan). */
  writeReactionNotification(
    db: ReactionsDb,
    questionId: string,
    recipientId: string,
    actorId: string,
    kind: ReactionKind,
  ) {
    return db.notification.create({
      data: { recipientId, actorId, type: REACTION_NOTIFICATION[kind], questionId },
    });
  }

  /** The system notice to the author when the conversation opens (no actor). Shown in M5. */
  writeConversationOpened(db: ReactionsDb, questionId: string, recipientId: string) {
    return db.notification.create({
      data: { recipientId, actorId: null, type: 'conversation_opened', questionId },
    });
  }

  findQuestionReaction(db: ReactionsDb, viewerId: string, questionId: string) {
    return db.questionReaction.findUnique({
      where: { userId_questionId: { userId: viewerId, questionId } },
      select: { kind: true },
    });
  }

  /** One reaction per user and question (R11). A new kind replaces the previous row; its date stays the day it was placed (DEC-164). */
  setQuestionReaction(db: ReactionsDb, viewerId: string, questionId: string, kind: ReactionKind) {
    return db.questionReaction.upsert({
      where: { userId_questionId: { userId: viewerId, questionId } },
      create: { userId: viewerId, questionId, kind },
      update: { kind },
    });
  }

  removeQuestionReaction(db: ReactionsDb, viewerId: string, questionId: string) {
    return db.questionReaction.delete({ where: { userId_questionId: { userId: viewerId, questionId } } });
  }

  changeQuestionCounters(db: ReactionsDb, questionId: string, change: CounterChange) {
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
