import { Injectable } from '@nestjs/common';
import type { Prisma } from '../database/generated/client/client';
import { visibleAccountTo } from '../users/account-visibility';

/** The Prisma client or a transaction opened by the service. */
export type MentionsDb = Prisma.TransactionClient;

/** How many accounts the repository reads for the suggestions before the service keeps five of them. */
export const SUGGESTION_CANDIDATE_LIMIT = 50;

/** Where a mention is written: its question, and its reply when the text is a reply. */
export interface MentionTarget {
  readonly questionId: string;
  readonly replyId?: string;
}

/** The only place that reads and writes the mention rows and their notifications (section 8.2). */
@Injectable()
export class MentionsRepository {
  /**
   * The accounts the viewer follows or that follow the viewer, visible to the viewer, whose handle contains the query.
   * Banned, deleted and blocked accounts are left out by visibleAccountTo (R13, R14).
   */
  findSuggestionCandidates(db: MentionsDb, viewerId: string, query: string) {
    return db.user.findMany({
      where: {
        AND: [
          visibleAccountTo(viewerId),
          {
            OR: [
              { followedBy: { some: { followerId: viewerId } } },
              { follows: { some: { followeeId: viewerId } } },
            ],
          },
          { handle: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { handle: true, displayName: true, avatarUrl: true },
      orderBy: { handle: 'asc' },
      take: SUGGESTION_CANDIDATE_LIMIT,
    });
  }

  /** The handles, among these, of the accounts a viewer may see: only their profile is linked in a text (section M3). */
  findVisibleHandles(db: MentionsDb, viewerId: string, handles: readonly string[]) {
    return db.user.findMany({
      where: { AND: [visibleAccountTo(viewerId), { handle: { in: [...handles], mode: 'insensitive' } }] },
      select: { handle: true },
    });
  }

  /** The active accounts with these handles, case-insensitive. Any other handle is plain text. */
  findActiveByHandles(db: MentionsDb, handles: readonly string[]) {
    return db.user.findMany({
      where: { status: 'active', handle: { in: [...handles], mode: 'insensitive' } },
      select: { id: true },
    });
  }

  /** One block in either direction between the author and any of these accounts (R14). */
  findBlockBetween(db: MentionsDb, authorId: string, mentionedUserIds: readonly string[]) {
    return db.block.findFirst({
      where: {
        OR: [
          { blockerId: authorId, blockedId: { in: [...mentionedUserIds] } },
          { blockerId: { in: [...mentionedUserIds] }, blockedId: authorId },
        ],
      },
      select: { blockerId: true },
    });
  }

  /** One mention row per account. A mention in a reply points to the reply, not to the question. */
  createMentions(db: MentionsDb, target: MentionTarget, mentionedUserIds: readonly string[]) {
    return db.mention.createMany({
      data: mentionedUserIds.map((mentionedUserId) => ({
        questionId: target.replyId ? null : target.questionId,
        replyId: target.replyId ?? null,
        mentionedUserId,
      })),
    });
  }

  /** One mention notification per account (written here, shown in M5). */
  writeMentionNotifications(
    db: MentionsDb,
    actorId: string,
    target: MentionTarget,
    mentionedUserIds: readonly string[],
  ) {
    return db.notification.createMany({
      data: mentionedUserIds.map((recipientId) => ({
        recipientId,
        actorId,
        type: 'mention',
        questionId: target.questionId,
        replyId: target.replyId ?? null,
      })),
    });
  }
}
