import { Injectable } from '@nestjs/common';
import { Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from '../questions/question-view';
import { visibleAccountTo } from '../users/account-visibility';
import { toPrefixQuery } from './prefix-query';

/** A hashtag with the reactions it received in the window (trends, DEC-091). */
export interface TrendingHashtagRow {
  readonly name: string;
  readonly reactions: number;
}

/** An account suggested to follow, with the figures that ranked it. */
export interface SuggestedAccountRow {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
}

/**
 * The only place that reads the Explore tables (section 8.2). Every read of a question goes through visibleTo, every
 * read of an account through visibleAccountTo, so the blocks and the R13 status rule apply the same way as everywhere.
 */
@Injectable()
export class ExploreRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The hashtags of the visible questions, with the reactions their questions got since `since`. Only active
   * reactors count (R13), and a reaction from or to a blocked account is left out (R14). Most reacted first.
   */
  trendingHashtags(viewerId: string, since: Date, count: number): Promise<TrendingHashtagRow[]> {
    return this.prisma.$queryRaw<TrendingHashtagRow[]>(Prisma.sql`
      SELECT h.name AS name, COUNT(*)::int AS reactions
      FROM question_reactions r
      JOIN users reactor ON reactor.id = r.user_id
      JOIN questions q ON q.id = r.question_id
      JOIN question_hashtags qh ON qh.question_id = q.id
      JOIN hashtags h ON h.id = qh.hashtag_id
      JOIN users author ON author.id = q.author_id
      WHERE r.created_at >= ${since}
        AND reactor.status = 'active'
        AND q.deleted_at IS NULL
        AND q.moderation_status = 'visible'
        AND author.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = q.author_id)
          OR (b.blocker_id = q.author_id AND b.blocked_id = ${viewerId}::uuid))
      GROUP BY h.name
      ORDER BY reactions DESC, h.name ASC
      LIMIT ${count}
    `);
  }

  /**
   * The visible questions with the most reactions since `since`, most reacted first, ties by id (popular questions,
   * DEC-091). Hidden questions and blocked authors are left out before the ranking.
   */
  async popularQuestionIds(viewerId: string, since: Date, count: number): Promise<string[]> {
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
  findVisibleQuestions(viewerId: string, ids: readonly string[]) {
    return this.prisma.question.findMany({
      where: { AND: [visibleTo(viewerId), { id: { in: [...ids] } }] },
      include: QUESTION_VIEW_INCLUDE,
    });
  }

  /** The newest visible questions carrying this hashtag, one page after the cursor (newest first). */
  findHashtagPage(
    viewerId: string,
    hashtag: string,
    after: { createdAt: Date; id: string } | null,
    take: number,
  ) {
    return this.prisma.question.findMany({
      where: {
        AND: [
          visibleTo(viewerId),
          { hashtags: { some: { hashtag: { name: hashtag } } } },
          after === null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: QUESTION_VIEW_INCLUDE,
    });
  }

  /**
   * The visible questions matching the text, newest first. The match uses the French full-text index on the question
   * body (DEC-022) with prefix matching; the rows are then read through the question view, like every other read.
   */
  async searchQuestions(viewerId: string, text: string, take: number) {
    const query = toPrefixQuery(text);
    if (query === null) {
      return [];
    }
    const matches = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT q.id
      FROM questions q
      JOIN users author ON author.id = q.author_id
      WHERE to_tsvector('french', q.body) @@ to_tsquery('french', ${query})
        AND q.deleted_at IS NULL
        AND q.moderation_status = 'visible'
        AND author.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = q.author_id)
          OR (b.blocker_id = q.author_id AND b.blocked_id = ${viewerId}::uuid))
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT ${take}
    `);

    return this.prisma.question.findMany({
      where: { id: { in: matches.map((match) => match.id) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: QUESTION_VIEW_INCLUDE,
    });
  }

  /** The hashtags whose name starts with the text (names are stored lowercase). */
  searchHashtags(text: string, take: number) {
    return this.prisma.hashtag.findMany({
      where: { name: { startsWith: text } },
      orderBy: { name: 'asc' },
      take,
      select: { name: true },
    });
  }

  /** The active accounts whose handle or display name matches the text, and that the viewer may see. */
  searchAccounts(viewerId: string, text: string, take: number) {
    return this.prisma.user.findMany({
      where: {
        AND: [
          visibleAccountTo(viewerId),
          {
            OR: [
              { handle: { startsWith: text, mode: 'insensitive' } },
              { displayName: { contains: text, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: { handle: 'asc' },
      take,
      select: { handle: true, displayName: true },
    });
  }

  /**
   * Active accounts the viewer does not follow, that have at least one visible question. They rank by the reactions
   * their questions got since `since` (the last 24 hours), then by the reactions of all time, then by a shared hashtag
   * (a hashtag the viewer used in a question), then by follower count. Blocked accounts are left out (R14).
   */
  suggestedAccounts(viewerId: string, since: Date, take: number): Promise<SuggestedAccountRow[]> {
    return this.prisma.$queryRaw<SuggestedAccountRow[]>(Prisma.sql`
      WITH viewer_hashtags AS (
        SELECT DISTINCT qh.hashtag_id
        FROM question_hashtags qh
        JOIN questions own ON own.id = qh.question_id
        WHERE own.author_id = ${viewerId}::uuid
      ),
      candidates AS (
        SELECT u.id, u.handle, u.display_name AS "displayName"
        FROM users u
        WHERE u.status = 'active'
          AND u.id <> ${viewerId}::uuid
          AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${viewerId}::uuid AND f.followee_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${viewerId}::uuid AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = ${viewerId}::uuid))
          AND EXISTS (SELECT 1 FROM questions q WHERE q.author_id = u.id AND q.deleted_at IS NULL AND q.moderation_status = 'visible')
      )
      SELECT c.id, c.handle, c."displayName"
      FROM candidates c
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n
        FROM question_reactions r
        JOIN questions q ON q.id = r.question_id
        JOIN users reactor ON reactor.id = r.user_id
        WHERE q.author_id = c.id AND r.created_at >= ${since} AND reactor.status = 'active'
      ) recent ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n
        FROM question_reactions r
        JOIN questions q ON q.id = r.question_id
        JOIN users reactor ON reactor.id = r.user_id
        WHERE q.author_id = c.id AND reactor.status = 'active'
      ) total ON true
      LEFT JOIN LATERAL (
        SELECT EXISTS (
          SELECT 1 FROM question_hashtags qh
          JOIN questions q ON q.id = qh.question_id
          WHERE q.author_id = c.id AND q.deleted_at IS NULL AND q.moderation_status = 'visible'
            AND qh.hashtag_id IN (SELECT hashtag_id FROM viewer_hashtags)
        ) AS shares
      ) shared ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM follows f WHERE f.followee_id = c.id
      ) followers ON true
      ORDER BY recent.n DESC, total.n DESC, shared.shares DESC, followers.n DESC, c.handle ASC
      LIMIT ${take}
    `);
  }
}
