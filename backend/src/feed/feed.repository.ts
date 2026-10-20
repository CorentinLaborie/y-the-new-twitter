import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from '../questions/question-view';
import type { CursorPosition } from './feed-cursor';

interface FeedPageQuery {
  readonly viewerId: string;
  readonly after: CursorPosition | null;
  readonly take: number;
  /** Questions left out of this page (the trending block of the first page). */
  readonly excludeIds: readonly string[];
}

/** The only place that reads the feed (section 8.2). */
@Injectable()
export class FeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The questions with the most reactions since `since`, most reacted first, ties by id. Hidden questions
   * and blocked authors are left out before the ranking, so they do not take a place. Only reactions of active
   * accounts are counted (R13), as in the stored counters.
   */
  async findTrendingIds(viewerId: string, since: Date, count: number): Promise<string[]> {
    const groups = await this.prisma.questionReaction.groupBy({
      by: ['questionId'],
      where: { createdAt: { gte: since }, question: visibleTo(viewerId), user: { status: 'active' } },
      _count: { questionId: true },
      orderBy: [{ _count: { questionId: 'desc' } }, { questionId: 'asc' }],
      take: count,
    });

    return groups.map((group) => group.questionId);
  }

  /** The visible questions among `ids`, with their author and hashtags. Order is not kept. */
  findVisibleByIds(viewerId: string, ids: readonly string[]) {
    return this.prisma.question.findMany({
      where: { AND: [visibleTo(viewerId), { id: { in: [...ids] } }] },
      include: QUESTION_VIEW_INCLUDE,
    });
  }

  /**
   * One page of the feed, newest first: every visible question (R12), minus `excludeIds`. The keyset on
   * (createdAt, id) returns each question once, even when new ones arrive between two pages.
   */
  findPage(query: FeedPageQuery) {
    const beforeCursor =
      query.after === null
        ? {}
        : {
            OR: [
              { createdAt: { lt: query.after.createdAt } },
              { createdAt: query.after.createdAt, id: { lt: query.after.id } },
            ],
          };

    return this.prisma.question.findMany({
      where: {
        AND: [visibleTo(query.viewerId), { id: { notIn: [...query.excludeIds] } }, beforeCursor],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.take,
      include: QUESTION_VIEW_INCLUDE,
    });
  }
}
