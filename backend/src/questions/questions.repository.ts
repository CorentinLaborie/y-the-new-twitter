import { Injectable } from '@nestjs/common';
import type { Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from './question-view';

/** The Prisma client or a transaction opened by the service. */
export type QuestionsDb = Prisma.TransactionClient;

/** The only place that reads and writes the question tables (section 8.2). */
@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The question with its author and hashtags, when this viewer may see it (visibleTo, R13, R14). */
  findVisibleQuestion(viewerId: string, questionId: string) {
    return this.prisma.question.findFirst({
      where: { AND: [{ id: questionId }, visibleTo(viewerId)] },
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

  /** The accounts among these authors that the viewer follows (author.viewerFollows, L3). */
  findFollowedAuthorIds(viewerId: string, authorIds: readonly string[]) {
    return this.prisma.follow.findMany({
      where: { followerId: viewerId, followeeId: { in: [...authorIds] } },
      select: { followeeId: true },
    });
  }

  /** The questions among these that the viewer saved (viewerSaved, L4). */
  findViewerSaved(viewerId: string, questionIds: readonly string[]) {
    return this.prisma.bookmark.findMany({
      where: { userId: viewerId, questionId: { in: [...questionIds] } },
      select: { questionId: true },
    });
  }

  createQuestion(db: QuestionsDb, authorId: string, body: string) {
    return db.question.create({ data: { authorId, body } });
  }

  /** Creates the hashtags that do not exist yet, then returns the ids of all of them. */
  async findOrCreateHashtags(db: QuestionsDb, names: readonly string[]): Promise<string[]> {
    await db.hashtag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
    const rows = await db.hashtag.findMany({ where: { name: { in: [...names] } }, select: { id: true } });

    return rows.map((row) => row.id);
  }

  linkHashtags(db: QuestionsDb, questionId: string, hashtagIds: readonly string[]) {
    return db.questionHashtag.createMany({
      data: hashtagIds.map((hashtagId) => ({ questionId, hashtagId })),
    });
  }
}
