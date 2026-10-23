import type { PrismaService } from '../database/prisma.service';
import { visibleTo } from './question-view';
import { QuestionsRepository } from './questions.repository';

describe('QuestionsRepository.findVisibleQuestion (R13, R14, section 9.2)', () => {
  it('reads the question through the feed filter for this viewer', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new QuestionsRepository({ question: { findFirst } } as unknown as PrismaService);

    await expect(repository.findVisibleQuestion('viewer-1', 'question-1')).resolves.toBeNull();

    expect(findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: 'question-1' }, visibleTo('viewer-1')] });
  });

  it('hides a question that is not visible, deleted, or whose author is not active, and blocks in both directions', () => {
    expect(visibleTo('viewer-1')).toEqual({
      AND: [
        { deletedAt: null, moderationStatus: 'visible', author: { status: 'active' } },
        {
          author: {
            status: 'active',
            blocks: { none: { blockedId: 'viewer-1' } },
            blockedBy: { none: { blockerId: 'viewer-1' } },
          },
        },
      ],
    });
  });
});
