import type { PrismaService } from '../database/prisma.service';
import { QUESTION_VIEW_INCLUDE, visibleTo } from '../questions/question-view';
import { FeedRepository } from './feed.repository';

describe('FeedRepository.findTrendingIds (R13)', () => {
  it('ranks only the reactions of active accounts, in the same query', async () => {
    const groupBy = jest.fn().mockResolvedValue([{ questionId: 'question-1' }, { questionId: 'question-2' }]);
    const repository = new FeedRepository({ questionReaction: { groupBy } } as unknown as PrismaService);
    const since = new Date('2026-10-19T10:00:00Z');

    const ids = await repository.findTrendingIds('viewer-1', since, 10);

    expect(ids).toEqual(['question-1', 'question-2']);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy.mock.calls[0][0]).toMatchObject({
      by: ['questionId'],
      where: expect.objectContaining({ createdAt: { gte: since }, user: { status: 'active' } }),
      take: 10,
    });
  });
});

describe('FeedRepository.findPage ("Pour vous")', () => {
  it('leaves out the trending questions and does not filter by follows', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new FeedRepository({ question: { findMany } } as unknown as PrismaService);

    await repository.findPage({ viewerId: 'viewer-1', after: null, take: 21, excludeIds: ['question-1'] });

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ id: { notIn: ['question-1'] } });
    expect(JSON.stringify(where)).not.toContain('followedBy');
  });
});

describe('FeedRepository.findFollowingPage ("Abonnements", E3)', () => {
  it('reads the visible questions of the followed authors only, newest first, in one query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new FeedRepository({ question: { findMany } } as unknown as PrismaService);

    await repository.findFollowingPage({ viewerId: 'viewer-1', after: null, take: 21 });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toEqual({
      where: {
        AND: [
          visibleTo('viewer-1'),
          { authorId: { not: 'viewer-1' } },
          { author: { followedBy: { some: { followerId: 'viewer-1' } } } },
          {},
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      include: QUESTION_VIEW_INCLUDE,
    });
  });

  it('keeps the viewer out of his own questions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new FeedRepository({ question: { findMany } } as unknown as PrismaService);

    await repository.findFollowingPage({ viewerId: 'viewer-1', after: null, take: 21 });

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ authorId: { not: 'viewer-1' } });
  });

  it('reads the follows as a subquery on the author, without loading the list of followed accounts', async () => {
    // The mock has no follow model: any read of the follows table outside the question query would throw.
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new FeedRepository({ question: { findMany } } as unknown as PrismaService);

    await repository.findFollowingPage({ viewerId: 'viewer-1', after: null, take: 21 });

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({
      author: { followedBy: { some: { followerId: 'viewer-1' } } },
    });
  });

  it('continues after the cursor with the (createdAt, id) keyset', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new FeedRepository({ question: { findMany } } as unknown as PrismaService);
    const createdAt = new Date('2026-10-20T10:00:00Z');

    await repository.findFollowingPage({
      viewerId: 'viewer-1',
      after: { createdAt, id: 'question-9' },
      take: 21,
    });

    expect(findMany.mock.calls[0][0].where.AND.at(-1)).toEqual({
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lt: 'question-9' } },
      ],
    });
  });
});
