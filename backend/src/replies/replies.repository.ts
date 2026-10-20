import { Injectable } from '@nestjs/common';
import type { Prisma, ReplyReactionKind } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { visibleTo } from '../questions/question-view';
import type { CursorPosition } from '../feed/feed-cursor';
import { REPLY_VIEW_INCLUDE, visibleReplyTo } from './reply-view';

/** The Prisma client or a transaction opened by the service. */
export type RepliesDb = Prisma.TransactionClient;

/** The only place that reads and writes the reply tables and the reply count (section 8.2). */
@Injectable()
export class RepliesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Locks the question row until the transaction ends: replies and reactions on one question run one at a time (B7). */
  async lockQuestion(db: RepliesDb, questionId: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM questions WHERE id = ${questionId}::uuid FOR UPDATE`;
  }

  /** Locks the reply row, so its counters and its deletion run one at a time (B6, B7). */
  async lockReply(db: RepliesDb, replyId: string): Promise<void> {
    await db.$queryRaw`SELECT id FROM replies WHERE id = ${replyId}::uuid FOR UPDATE`;
  }

  /** The question, when this viewer may see it (hidden, deleted, inactive or blocked is not found). */
  findVisibleQuestion(db: RepliesDb, viewerId: string, questionId: string) {
    return db.question.findFirst({
      where: { AND: [{ id: questionId }, visibleTo(viewerId)] },
      select: { id: true, authorId: true, conversationOpenedAt: true },
    });
  }

  /** The question's author is told of a reply (B9). Nothing is written when the author replies to their own question. */
  writeReplyNotification(
    db: RepliesDb,
    recipientId: string,
    actorId: string,
    questionId: string,
    replyId: string,
  ) {
    return db.notification.create({
      data: { recipientId, actorId, type: 'reply_to_question', questionId, replyId },
    });
  }

  createReply(db: RepliesDb, authorId: string, questionId: string, body: string) {
    return db.reply.create({
      data: { authorId, questionId, body },
      include: REPLY_VIEW_INCLUDE,
    });
  }

  /** Moves the reply count of a question: +1 when a reply is posted, -1 when it is deleted. */
  changeQuestionReplyCount(db: RepliesDb, questionId: string, change: number) {
    return db.question.update({ where: { id: questionId }, data: { replyCount: { increment: change } } });
  }

  /** One page of replies under a question, oldest first, keyset on (createdAt, id). */
  findPage(viewerId: string, questionId: string, after: CursorPosition | null, take: number) {
    const afterCursor =
      after === null
        ? {}
        : {
            OR: [
              { createdAt: { gt: after.createdAt } },
              { createdAt: after.createdAt, id: { gt: after.id } },
            ],
          };

    return this.prisma.reply.findMany({
      where: { AND: [visibleReplyTo(viewerId), { questionId }, afterCursor] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      include: REPLY_VIEW_INCLUDE,
    });
  }

  /** The viewer's own reaction rows on these replies: both kinds can be set on one reply (R2). */
  findViewerReplyReactions(viewerId: string, replyIds: readonly string[]) {
    return this.prisma.replyReaction.findMany({
      where: { userId: viewerId, replyId: { in: [...replyIds] } },
      select: { replyId: true, kind: true },
    });
  }

  findVisibleReply(db: RepliesDb, viewerId: string, replyId: string) {
    return db.reply.findFirst({
      where: { AND: [{ id: replyId }, visibleReplyTo(viewerId)] },
      select: { id: true, likeCount: true, dislikeCount: true },
    });
  }

  findReplyForAuthor(db: RepliesDb, replyId: string) {
    return db.reply.findUnique({
      where: { id: replyId },
      select: { id: true, questionId: true, authorId: true, deletedAt: true },
    });
  }

  /** Soft delete by the author (DEC-087). The reply row is locked by the caller, so it is deleted once. */
  markDeleted(db: RepliesDb, replyId: string, at: Date) {
    return db.reply.update({ where: { id: replyId }, data: { deletedAt: at } });
  }

  findReplyReaction(db: RepliesDb, viewerId: string, replyId: string, kind: ReplyReactionKind) {
    return db.replyReaction.findUnique({
      where: { userId_replyId_kind: { userId: viewerId, replyId, kind } },
      select: { kind: true },
    });
  }

  addReplyReaction(db: RepliesDb, viewerId: string, replyId: string, kind: ReplyReactionKind) {
    return db.replyReaction.create({ data: { userId: viewerId, replyId, kind } });
  }

  removeReplyReaction(db: RepliesDb, viewerId: string, replyId: string, kind: ReplyReactionKind) {
    return db.replyReaction.deleteMany({ where: { userId: viewerId, replyId, kind } });
  }

  findViewerReplyKinds(db: RepliesDb, viewerId: string, replyId: string) {
    return db.replyReaction.findMany({
      where: { userId: viewerId, replyId },
      select: { kind: true },
    });
  }

  findReplyCounters(db: RepliesDb, replyId: string) {
    return db.reply.findUniqueOrThrow({
      where: { id: replyId },
      select: { likeCount: true, dislikeCount: true },
    });
  }

  changeReplyCounters(db: RepliesDb, replyId: string, change: { like: number; dislike: number }) {
    return db.reply.update({
      where: { id: replyId },
      data: { likeCount: { increment: change.like }, dislikeCount: { increment: change.dislike } },
    });
  }
}
