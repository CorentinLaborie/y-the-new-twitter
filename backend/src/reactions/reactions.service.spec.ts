import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { PrismaService } from '../database/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { ReactionsRepository } from './reactions.repository';
import { counterChange, ReactionsService } from './reactions.service';

type Repository = jest.Mocked<
  Pick<
    ReactionsRepository,
    | 'lockQuestion'
    | 'findVisibleQuestion'
    | 'findQuestionCounters'
    | 'findQuestionReaction'
    | 'setQuestionReaction'
    | 'removeQuestionReaction'
    | 'changeQuestionCounters'
    | 'openConversation'
    | 'writeConversationOpened'
    | 'writeReactionNotification'
  >
>;

type Users = jest.Mocked<Pick<UsersRepository, 'lockActiveAccount'>>;

const VIEWER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};
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
  let users: Users;
  let prisma: { $transaction: jest.Mock };
  let service: ReactionsService;

  beforeEach(() => {
    repository = {
      lockQuestion: jest.fn().mockResolvedValue(undefined),
      findVisibleQuestion: jest.fn().mockResolvedValue({ id: QUESTION_ID }),
      findQuestionCounters: jest.fn().mockResolvedValue({
        authorId: 'author-1',
        likeCount: 3,
        dislikeCount: 1,
        yCount: 49,
        conversationOpenedAt: null,
      }),
      findQuestionReaction: jest.fn().mockResolvedValue(null),
      setQuestionReaction: jest.fn().mockResolvedValue(undefined),
      removeQuestionReaction: jest.fn().mockResolvedValue(undefined),
      changeQuestionCounters: jest.fn().mockResolvedValue(undefined),
      openConversation: jest.fn().mockResolvedValue({ count: 0 }),
      writeConversationOpened: jest.fn().mockResolvedValue(undefined),
      writeReactionNotification: jest.fn().mockResolvedValue(undefined),
    };
    users = { lockActiveAccount: jest.fn().mockResolvedValue(true) };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx')) };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    service = new ReactionsService(
      prisma as unknown as PrismaService,
      repository as unknown as ReactionsRepository,
      users as unknown as UsersRepository,
      config,
    );
  });

  it('locks the viewer account before the question, so a status change and a reaction never interleave (R13)', async () => {
    await service.set(VIEWER, QUESTION_ID, 'y');

    expect(users.lockActiveAccount).toHaveBeenCalledWith('tx', 'user-1');
    expect(users.lockActiveAccount.mock.invocationCallOrder[0]).toBeLessThan(
      repository.lockQuestion.mock.invocationCallOrder[0],
    );
  });

  it('refuses a viewer whose account is no longer active under the lock, and writes nothing (R13)', async () => {
    users.lockActiveAccount.mockResolvedValue(false);

    await expect(service.set(VIEWER, QUESTION_ID, 'y')).rejects.toThrow(ForbiddenException);
    await expect(service.remove(VIEWER, QUESTION_ID, 'y')).rejects.toThrow(ForbiddenException);
    expect(repository.lockQuestion).not.toHaveBeenCalled();
    expect(repository.setQuestionReaction).not.toHaveBeenCalled();
    expect(repository.changeQuestionCounters).not.toHaveBeenCalled();
  });

  it('sets a new reaction, updates the counters and returns them with the Y progress', async () => {
    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.lockQuestion).toHaveBeenCalledWith('tx', QUESTION_ID);
    expect(repository.setQuestionReaction).toHaveBeenCalledWith('tx', 'user-1', QUESTION_ID, 'y');
    expect(repository.changeQuestionCounters).toHaveBeenCalledWith('tx', QUESTION_ID, {
      like: 0,
      dislike: 0,
      y: 1,
    });
    expect(response).toEqual({
      questionId: QUESTION_ID,
      counters: { like: 3, dislike: 1, y: 49 },
      viewerReactions: [],
      yThreshold: 50,
      conversationOpen: false,
    });
  });

  it('opens the conversation once, when the Y count reaches the threshold (R3)', async () => {
    repository.findQuestionCounters.mockResolvedValue({
      likeCount: 0,
      dislikeCount: 0,
      yCount: 50,
      conversationOpenedAt: null,
    } as never);

    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.openConversation).toHaveBeenCalledWith('tx', QUESTION_ID, expect.any(Date));
    expect(response.conversationOpen).toBe(true);
  });

  it('writes one conversation_opened notice to the author on the first opening only (B2)', async () => {
    repository.findQuestionCounters.mockResolvedValue({
      authorId: 'author-1',
      likeCount: 0,
      dislikeCount: 0,
      yCount: 50,
      conversationOpenedAt: null,
    } as never);
    repository.openConversation.mockResolvedValue({ count: 1 });

    await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.writeConversationOpened).toHaveBeenCalledWith('tx', QUESTION_ID, 'author-1');
  });

  it('writes no notice when another request has already opened the conversation (B2)', async () => {
    repository.findQuestionCounters.mockResolvedValue({
      authorId: 'author-1',
      likeCount: 0,
      dislikeCount: 0,
      yCount: 50,
      conversationOpenedAt: null,
    } as never);
    repository.openConversation.mockResolvedValue({ count: 0 });

    await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.writeConversationOpened).not.toHaveBeenCalled();
  });

  it("writes no notice when the author's own Y opens the conversation (no notification for an own action)", async () => {
    repository.findQuestionCounters.mockResolvedValue({
      authorId: VIEWER.id,
      likeCount: 0,
      dislikeCount: 0,
      yCount: 50,
      conversationOpenedAt: null,
    } as never);
    repository.openConversation.mockResolvedValue({ count: 1 });

    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.openConversation).toHaveBeenCalledWith('tx', QUESTION_ID, expect.any(Date));
    expect(repository.writeConversationOpened).not.toHaveBeenCalled();
    expect(response.conversationOpen).toBe(true);
  });

  it('keeps the conversation open when the Y count drops back below the threshold (R13)', async () => {
    repository.findQuestionCounters.mockResolvedValue({
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
    repository.findQuestionReaction.mockResolvedValue({ kind: 'like' });

    await service.set(VIEWER, QUESTION_ID, 'dislike');

    expect(repository.changeQuestionCounters).toHaveBeenCalledWith('tx', QUESTION_ID, {
      like: -1,
      dislike: 1,
      y: 0,
    });
  });

  it('changes nothing when the viewer repeats the same kind', async () => {
    repository.findQuestionReaction.mockResolvedValue({ kind: 'y' });

    const response = await service.set(VIEWER, QUESTION_ID, 'y');

    expect(repository.setQuestionReaction).not.toHaveBeenCalled();
    expect(repository.changeQuestionCounters).not.toHaveBeenCalled();
    expect(response.viewerReactions).toEqual(['y']);
  });

  it('refuses a hidden or missing question with 404, before any write', async () => {
    repository.findVisibleQuestion.mockResolvedValue(null);

    await expect(service.set(VIEWER, QUESTION_ID, 'like')).rejects.toThrow(NotFoundException);
    expect(repository.setQuestionReaction).not.toHaveBeenCalled();
  });

  it('writes one reaction notice to the author for a new reaction (L2, section 4.1)', async () => {
    await service.set(VIEWER, QUESTION_ID, 'like');

    expect(repository.writeReactionNotification).toHaveBeenCalledWith(
      'tx',
      QUESTION_ID,
      'author-1',
      'user-1',
      'like',
    );
  });

  it("writes no reaction notice for the author's own reaction (L2, section 4.1)", async () => {
    repository.findQuestionCounters.mockResolvedValue({
      authorId: 'user-1',
      likeCount: 0,
      dislikeCount: 0,
      yCount: 0,
      conversationOpenedAt: null,
    });

    await service.set(VIEWER, QUESTION_ID, 'like');

    expect(repository.writeReactionNotification).not.toHaveBeenCalled();
  });

  it('writes no reaction notice when the viewer repeats the same kind', async () => {
    repository.findQuestionReaction.mockResolvedValue({ kind: 'like' });

    await service.set(VIEWER, QUESTION_ID, 'like');

    expect(repository.writeReactionNotification).not.toHaveBeenCalled();
  });

  it('writes no reaction notice when a reaction is removed', async () => {
    repository.findQuestionReaction.mockResolvedValue({ kind: 'like' });

    await service.remove(VIEWER, QUESTION_ID, 'like');

    expect(repository.writeReactionNotification).not.toHaveBeenCalled();
  });

  it('removes only a reaction of the kind named in the request', async () => {
    repository.findQuestionReaction.mockResolvedValue({ kind: 'like' });

    await service.remove(VIEWER, QUESTION_ID, 'y');
    expect(repository.removeQuestionReaction).not.toHaveBeenCalled();

    await service.remove(VIEWER, QUESTION_ID, 'like');
    expect(repository.removeQuestionReaction).toHaveBeenCalledWith('tx', 'user-1', QUESTION_ID);
    expect(repository.changeQuestionCounters).toHaveBeenCalledWith('tx', QUESTION_ID, {
      like: -1,
      dislike: 0,
      y: 0,
    });
  });
});
