import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../common/pagination/keyset-cursor';
import { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from '../questions/question-view';
import { visibleAccountTo } from '../users/account-visibility';

/** The only place that reads the profile of an account and its questions (section 8.2). */
@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The account with this handle (any case), when the viewer may see it: active, not deleted, no block either way. */
  findVisibleAccount(viewerId: string, handle: string) {
    return this.prisma.user.findFirst({
      where: {
        AND: [
          { handle: { equals: handle, mode: 'insensitive' } },
          { deletedAt: null },
          visibleAccountTo(viewerId),
        ],
      },
      select: {
        id: true,
        handle: true,
        displayName: true,
        bio: true,
        createdAt: true,
        followerCount: true,
        followingCount: true,
      },
    });
  }

  /** Whether the viewer follows the account. */
  async viewerFollows(viewerId: string, accountId: string): Promise<boolean> {
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: accountId } },
      select: { followerId: true },
    });

    return follow !== null;
  }

  /**
   * One page of the questions of an account, newest first, with the keyset on (createdAt, id). Only the questions the
   * viewer may see are returned (visibleTo: hidden, deleted and blocked are left out).
   */
  findQuestionPage(viewerId: string, authorId: string, after: KeysetPosition | null, take: number) {
    const afterPosition =
      after === null
        ? {}
        : {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          };

    return this.prisma.question.findMany({
      where: { AND: [visibleTo(viewerId), { authorId }, afterPosition] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: QUESTION_VIEW_INCLUDE,
    });
  }

  /** The viewer's own reactions on these questions: at most one per question (R11). */
  findViewerReactions(viewerId: string, questionIds: readonly string[]) {
    return this.prisma.questionReaction.findMany({
      where: { userId: viewerId, questionId: { in: [...questionIds] } },
      select: { questionId: true, kind: true },
    });
  }

  /** The questions among these that the viewer saved (viewerSaved, L4). */
  findViewerSaved(viewerId: string, questionIds: readonly string[]) {
    return this.prisma.bookmark.findMany({
      where: { userId: viewerId, questionId: { in: [...questionIds] } },
      select: { questionId: true },
    });
  }
}
