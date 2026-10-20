import { Injectable } from '@nestjs/common';
import type { Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by the service. */
export type MentionsDb = Prisma.TransactionClient;

/** Where a mention is written: its question, and its reply when the text is a reply. */
export interface MentionTarget {
  readonly questionId: string;
  readonly replyId?: string;
}

/** The only place that reads and writes the mention rows and their notifications (section 8.2). */
@Injectable()
export class MentionsRepository {
  /** The active accounts with these handles, case-insensitive. Any other handle is plain text. */
  findActiveByHandles(db: MentionsDb, handles: readonly string[]) {
    return db.user.findMany({
      where: { status: 'active', handle: { in: [...handles], mode: 'insensitive' } },
      select: { id: true },
    });
  }

  /** One block in either direction between the author and any of these accounts (R14). */
  findBlockBetween(db: MentionsDb, authorId: string, userIds: readonly string[]) {
    return db.block.findFirst({
      where: {
        OR: [
          { blockerId: authorId, blockedId: { in: [...userIds] } },
          { blockerId: { in: [...userIds] }, blockedId: authorId },
        ],
      },
      select: { blockerId: true },
    });
  }

  /** One mention row per account. A mention in a reply points to the reply, not to the question. */
  createMentions(db: MentionsDb, target: MentionTarget, userIds: readonly string[]) {
    return db.mention.createMany({
      data: userIds.map((mentionedUserId) => ({
        questionId: target.replyId ? null : target.questionId,
        replyId: target.replyId ?? null,
        mentionedUserId,
      })),
    });
  }

  /** One mention notification per account (written here, shown in M5). */
  writeMentionNotifications(db: MentionsDb, actorId: string, target: MentionTarget, recipientIds: readonly string[]) {
    return db.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        actorId,
        type: 'mention',
        questionId: target.questionId,
        replyId: target.replyId ?? null,
      })),
    });
  }
}
