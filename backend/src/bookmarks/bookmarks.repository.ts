import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../common/pagination/keyset-cursor';
import type { Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from '../questions/question-view';
import type { BookmarkSort } from './dto/bookmark-list-query.dto';

/**
 * The rows after a keyset position, in the given order. By save date: (saved at desc, question id desc). By question
 * date: (question created at desc, question id desc). The position carries the time of that order.
 */
function afterPosition(after: KeysetPosition | undefined, sort: BookmarkSort): Prisma.BookmarkWhereInput {
  if (after === undefined) {
    return {};
  }

  if (sort === 'question') {
    return {
      OR: [
        { question: { createdAt: { lt: after.createdAt } } },
        { question: { createdAt: after.createdAt }, questionId: { lt: after.id } },
      ],
    };
  }

  return {
    OR: [
      { createdAt: { lt: after.createdAt } },
      { createdAt: after.createdAt, questionId: { lt: after.id } },
    ],
  };
}

/** The only place that reads and writes the saved questions (bookmark rows, L4). */
@Injectable()
export class BookmarksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The question id, when the viewer may see the question (visibleTo, R13, R14). Null when it is not visible. */
  findVisibleQuestion(viewerId: string, questionId: string) {
    return this.prisma.question.findFirst({
      where: { AND: [{ id: questionId }, visibleTo(viewerId)] },
      select: { id: true },
    });
  }

  /** Saves the question. True only when the row is new: saving it again changes nothing (idempotence). */
  async createBookmark(viewerId: string, questionId: string): Promise<boolean> {
    const result = await this.prisma.bookmark.createMany({
      data: { userId: viewerId, questionId },
      skipDuplicates: true,
    });

    return result.count === 1;
  }

  deleteBookmark(viewerId: string, questionId: string) {
    return this.prisma.bookmark.deleteMany({ where: { userId: viewerId, questionId } });
  }

  /**
   * One page of the saved questions, in the given order. A question the viewer may no longer see (hidden, deleted,
   * author inactive or blocked, R13, R14) is left out, like in the feed.
   */
  findPage(viewerId: string, after: KeysetPosition | undefined, take: number, sort: BookmarkSort, search?: string) {
    return this.prisma.bookmark.findMany({
      where: {
        AND: [{ userId: viewerId }, { question: visibleTo(viewerId) }, afterPosition(after, sort), searchFilter(search)],
      },
      orderBy:
        sort === 'question'
          ? [{ question: { createdAt: 'desc' } }, { questionId: 'desc' }]
          : [{ createdAt: 'desc' }, { questionId: 'desc' }],
      take,
      include: { question: { include: QUESTION_VIEW_INCLUDE } },
    });
  }

  /** How many questions the viewer saved and may still see, whatever the search: the total of the header (L4). */
  countVisible(viewerId: string): Promise<number> {
    return this.prisma.bookmark.count({ where: { userId: viewerId, question: visibleTo(viewerId) } });
  }
}

/**
 * The saved questions matching a search: the question text, or the name or the handle of its author, without case.
 * A blank or absent search matches everything.
 */
function searchFilter(search: string | undefined): Prisma.BookmarkWhereInput {
  if (search === undefined || search === '') {
    return {};
  }
  const contains = { contains: search, mode: 'insensitive' as const };

  return {
    question: {
      OR: [
        { body: contains },
        { author: { handle: contains } },
        { author: { displayName: contains } },
      ],
    },
  };
}
