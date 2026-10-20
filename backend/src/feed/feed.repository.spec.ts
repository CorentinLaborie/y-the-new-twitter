import type { PrismaService } from '../database/prisma.service';
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
