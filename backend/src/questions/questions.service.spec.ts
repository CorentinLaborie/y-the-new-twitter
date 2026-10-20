import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { IdempotencyRepository } from '../common/idempotency/idempotency.repository';
import { IdempotencyService, requestHash } from '../common/idempotency/idempotency.service';
import { Prisma } from '../database/generated/client/client';
import type { PrismaService } from '../database/prisma.service';
import type { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';

type Repository = jest.Mocked<Pick<QuestionsRepository, 'createQuestion' | 'findOrCreateHashtags' | 'linkHashtags'>>;

type KeyRepository = jest.Mocked<Pick<IdempotencyRepository, 'find' | 'deleteExpired' | 'save'>>;

const AUTHOR: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  role: 'user',
  status: 'active',
};

const CREATED_AT = new Date('2026-10-20T10:41:00.000Z');
const LIVE_KEY_EXPIRY = new Date(Date.now() + 60 * 60 * 1000);
const EXPIRED_KEY_EXPIRY = new Date(Date.now() - 1000);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fingerprint of the text on POST /questions, as the service stores it (DEC-185). */
const HASH_BONJOUR = requestHash('POST /questions', 'Bonjour');

function dto(text: string): CreateQuestionDto {
  return { text } as CreateQuestionDto;
}

function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
  });
}

describe('QuestionsService (B2, section 9.1)', () => {
  let repository: Repository;
  let keys: KeyRepository;
  let prisma: { $transaction: jest.Mock };
  let service: QuestionsService;

  beforeEach(() => {
    repository = {
      createQuestion: jest.fn().mockImplementation(async (_db, authorId: string, body: string) => ({
        id: 'question-1',
        authorId,
        body,
        likeCount: 0,
        dislikeCount: 0,
        yCount: 0,
        replyCount: 0,
        conversationOpenedAt: null,
        createdAt: CREATED_AT,
      })),
      findOrCreateHashtags: jest.fn().mockImplementation(async (_db, names: string[]) => names.map((n) => `id-${n}`)),
      linkHashtags: jest.fn().mockResolvedValue({ count: 0 }),
    };
    keys = {
      find: jest.fn().mockResolvedValue(null),
      deleteExpired: jest.fn().mockResolvedValue({ count: 0 }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx')) };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    const idempotency = new IdempotencyService(prisma as unknown as PrismaService, keys as unknown as IdempotencyRepository);
    service = new QuestionsService(
      prisma as unknown as PrismaService,
      repository as unknown as QuestionsRepository,
      idempotency,
      config,
    );
  });

  it('stores the question for the session user and returns it with zero counters and 0/50 Y', async () => {
    const response = await service.create(AUTHOR, dto('Bonjour tout le monde'));

    expect(repository.createQuestion).toHaveBeenCalledWith('tx', 'user-1', 'Bonjour tout le monde');
    expect(response).toEqual({
      id: 'question-1',
      text: 'Bonjour tout le monde',
      createdAt: '2026-10-20T10:41:00.000Z',
      author: { handle: 'alice', displayName: 'Alice' },
      hashtags: [],
      counters: { like: 0, dislike: 0, y: 0, reply: 0 },
      yThreshold: 50,
      conversationOpen: false,
      viewerReactions: [],
    });
  });

  it('creates the question, its hashtags and the links in one transaction', async () => {
    const response = await service.create(AUTHOR, dto('Sujet #Online_Life et #irl'));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repository.findOrCreateHashtags).toHaveBeenCalledWith('tx', ['online_life', 'irl']);
    expect(repository.linkHashtags).toHaveBeenCalledWith('tx', 'question-1', ['id-online_life', 'id-irl']);
    expect(response.hashtags).toEqual(['irl', 'online_life']);
  });

  it('accepts 280 characters and refuses 281 with 422, before any write', async () => {
    await expect(service.create(AUTHOR, dto('a'.repeat(280)))).resolves.toMatchObject({ id: 'question-1' });

    prisma.$transaction.mockClear();
    await expect(service.create(AUTHOR, dto('a'.repeat(281)))).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an empty text with 422, before any write', async () => {
    await expect(service.create(AUTHOR, dto(''))).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('Idempotency-Key', () => {
    it('stores the key with the fingerprint of the text and the response, in the question transaction', async () => {
      await service.create(AUTHOR, dto('Bonjour'), 'key-1');

      expect(keys.find).toHaveBeenCalledWith('user-1', 'key-1');
      expect(keys.save).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ userId: 'user-1', key: 'key-1', requestHash: HASH_BONJOUR }),
      );
    });

    it('stores the key for 24 hours after its first use', async () => {
      const before = Date.now();

      await service.create(AUTHOR, dto('Bonjour'), 'key-1');

      const [, record] = keys.save.mock.calls[0];
      const lifetime = record.expiresAt.getTime() - before;
      expect(lifetime).toBeGreaterThanOrEqual(DAY_MS);
      expect(lifetime).toBeLessThanOrEqual(DAY_MS + 60_000);
    });

    it('treats a key older than 24 hours as absent: the question is created and the key replaced', async () => {
      keys.find.mockResolvedValue({
        requestHash: HASH_BONJOUR,
        response: { id: 'question-old' } as unknown as Prisma.JsonValue,
        expiresAt: EXPIRED_KEY_EXPIRY,
      } as never);

      const response = await service.create(AUTHOR, dto('Bonjour'), 'key-1');

      expect(response.id).toBe('question-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(keys.deleteExpired).toHaveBeenCalledWith('tx', 'user-1', 'key-1', expect.any(Date));
      expect(keys.save).toHaveBeenCalledWith('tx', expect.objectContaining({ key: 'key-1', requestHash: HASH_BONJOUR }));
    });

    it('returns the first response, without writing, when the key and the text are the same', async () => {
      const first = { id: 'question-first', text: 'Bonjour' };
      keys.find.mockResolvedValue({
        requestHash: HASH_BONJOUR,
        response: first as unknown as Prisma.JsonValue,
        expiresAt: LIVE_KEY_EXPIRY,
      } as never);

      await expect(service.create(AUTHOR, dto('Bonjour'), 'key-1')).resolves.toEqual(first);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the same key with another text (422), without writing', async () => {
      keys.find.mockResolvedValue({
        requestHash: HASH_BONJOUR,
        response: {} as Prisma.JsonValue,
        expiresAt: LIVE_KEY_EXPIRY,
      } as never);

      await expect(service.create(AUTHOR, dto('Autre texte'), 'key-1')).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns the response of a concurrent request that stored the same key first', async () => {
      const winner = { id: 'question-winner', text: 'Bonjour' };
      keys.find
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ requestHash: HASH_BONJOUR, response: winner, expiresAt: LIVE_KEY_EXPIRY } as never);
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());

      await expect(service.create(AUTHOR, dto('Bonjour'), 'key-1')).resolves.toEqual(winner);
    });

    it('rethrows an error that is not a unique violation', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.create(AUTHOR, dto('Bonjour'), 'key-1')).rejects.toThrow('connection lost');
    });

    it('refuses an empty key (400) and a key over 255 characters (400), before any write', async () => {
      await expect(service.create(AUTHOR, dto('Bonjour'), '')).rejects.toThrow(BadRequestException);
      await expect(service.create(AUTHOR, dto('Bonjour'), 'k'.repeat(256))).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
