import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { PrismaService } from '../database/prisma.service';
import { ReactionsRepository } from './reactions.repository';
import { counterChange, ReactionsService } from './reactions.service';

type Repository = jest.Mocked<
  Pick<
    ReactionsRepository,
    | 'lockQuestion'
    | 'findVisibleQuestion'
    | 'findCounters'
    | 'findReaction'
    | 'setReaction'
    | 'removeReaction'
    | 'changeCounters'
    | 'openConversation'
  >
>;

const VIEWER: SessionUser = { id: 'user-1', handle: 'alice', displayName: 'Alice', role: 'user', status: 'active' };
const QUESTION_ID = '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

describe('counterChange (B3, B4)', () => {
  it('adds one to the new kind when there was no reaction', () => {
    expect(counterChange(null, 'y')).toEqual({ like: 0, dislike: 0, y: 1 });
  });

  it('moves one from the previous kind to the new one', () => {
    expect(counterChange('like', 'dislike')).toEqual({ like: -1, dislike: 1, y: 0 });
  });

  it('removes one from the kind that is removed', () => {
    expect(counterChange('y', null)).toEqual({ like: 0, dislike: 0, y: -1 });
  });
});

describe('ReactionsService (B3, B5)', () => {
  let repository: Repository;
  let prisma: { $transaction: jest.Mock };
  let service: ReactionsService;

  beforeEach(() => {
    repository = {
      lockQuestion: jest.fn().mockResolvedValue(undefined),
      findVisibleQuestion: jest.fn().mockResolvedValue({ id: QUESTION_ID }),
      findCounters: jest.fn().mockResolvedValue({ likeCount: 3, dislikeCount: 1, yCount: 49, conversationOpenedAt: null }),
      findReaction: jest.fn().mockResolvedValue(null),
      setReaction: jest.fn().mockResolvedValue(undefined),
      removeReaction: jest.fn().mockResolvedValue(undefined),
      changeCounters: jest.fn().mockResolvedValue(undefined),
      openConversation: jest.fn().mockResolvedValue({ count: 0 }),
    };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx')) };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    service = new ReactionsService(prisma as unknown as PrismaService, repository as unknown as ReactionsRepository, config);
  });

  it('sets a new reaction, updates the counters and returns them with the Y progress', async () => {
    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.lockQuestion).toHaveBeenCalledWith('tx', QUESTION_ID);
    expect(repository.setReaction).toHaveBeenCalledWith('tx', 'user-1', QUESTION_ID, 'y');
    expect(repository.changeCounters).toHaveBeenCalledWith('tx', QUESTION_ID, { like: 0, dislike: 0, y: 1 });
    expect(response).toEqual({
      questionId: QUESTION_ID,
      counts: { like: 3, dislike: 1, y: 49 },
      viewerReactions: [],
      yThreshold: 50,
      conversationOpen: false,
    });
  });

  it('opens the conversation once, when the Y count reaches the threshold (R3)', async () => {
    repository.findCounters.mockResolvedValue({ likeCount: 0, dislikeCount: 0, yCount: 50, conversationOpenedAt: null } as never);

    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.openConversation).toHaveBeenCalledWith('tx', QUESTION_ID, expect.any(Date));
    expect(response.conversationOpen).toBe(true);
  });

  it('keeps the conversation open when the Y count drops back below the threshold (R13)', async () => {
    repository.findCounters.mockResolvedValue({
      likeCount: 0,
      dislikeCount: 0,
      yCount: 49,
      conversationOpenedAt: new Date(),
    } as never);

    const response = await service.set(VIEWER, QUESTION_ID, 'like');

    expect(repository.openConversation).not.toHaveBeenCalled();
    expect(response.conversationOpen).toBe(true);
  });

  it('replaces the previous kind of the viewer: one counter down, one up (R11)', async () => {
    repository.findReaction.mockResolvedValue({ kind: 'like' });

    await service.set(VIEWER, QUESTION_ID, 'dislike');

    expect(repository.changeCounters).toHaveBeenCalledWith('tx', QUESTION_ID, { like: -1, dislike: 1, y: 0 });
  });

  it('changes nothing when the viewer repeats the same kind', async () => {
    repository.findReaction.mockResolvedValue({ kind: 'y' });

    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.setReaction).not.toHaveBeenCalled();
    expect(repository.changeCounters).not.toHaveBeenCalled();
    expect(response.viewerReactions).toEqual(['y']);
  });

  it('refuses a hidden or missing question with 404, before any write', async () => {
    repository.findVisibleQuestion.mockResolvedValue(null);

    await expect(service.set(VIEWER, QUESTION_ID, 'like')).rejects.toThrow(NotFoundException);
    expect(repository.setReaction).not.toHaveBeenCalled();
  });

  it('removes only a reaction of the kind named in the request', async () => {
    repository.findReaction.mockResolvedValue({ kind: 'like' });

    await service.remove(VIEWER, QUESTION_ID, 'y');
    expect(repository.removeReaction).not.toHaveBeenCalled();

    await service.remove(VIEWER, QUESTION_ID, 'like');
    expect(repository.removeReaction).toHaveBeenCalledWith('tx', 'user-1', QUESTION_ID);
    expect(repository.changeCounters).toHaveBeenCalledWith('tx', QUESTION_ID, { like: -1, dislike: 0, y: 0 });
  });
});
