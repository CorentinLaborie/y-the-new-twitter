import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { IdempotencyRepository } from '../common/idempotency/idempotency.repository';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { Prisma } from '../database/generated/client/client';
import type { PrismaService } from '../database/prisma.service';
import type { MentionsService } from '../mentions/mentions.service';
import type { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionsRepository } from './questions.repository';
import { QuestionsService } from './questions.service';

type Repository = jest.Mocked<
  Pick<QuestionsRepository, 'createQuestion' | 'findOrCreateHashtags' | 'linkHashtags'>
>;

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

/** Fingerprint of the text on POST /questions: the SHA-256 of the text alone, as before DEC-185. */
const HASH_BONJOUR = createHash('sha256').update('Bonjour').digest('hex');

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
      findOrCreateHashtags: jest
        .fn()
        .mockImplementation(async (_db, names: string[]) => names.map((n) => `id-${n}`)),
      linkHashtags: jest.fn().mockResolvedValue({ count: 0 }),
    };
    keys = {
      find: jest.fn().mockResolvedValue(null),
      deleteExpired: jest.fn().mockResolvedValue({ count: 0 }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx')) };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    const idempotency = new IdempotencyService(
      prisma as unknown as PrismaService,
      keys as unknown as IdempotencyRepository,
    );
    const mentions = {
      resolve: jest.fn().mockResolvedValue([]),
      record: jest.fn().mockResolvedValue(undefined),
    };
    service = new QuestionsService(
      prisma as unknown as PrismaService,
      repository as unknown as QuestionsRepository,
      idempotency,
      config,
      mentions as unknown as MentionsService,
    );
  });

  it('stores the question for the session user and returns it with zero counters and 0/50 Y', async () => {
    const response = await service.create(AUTHOR, dto('Bonjour tout le monde'));

    expect(repository.createQuestion).toHaveBeenCalledWith('tx', 'user-1', 'Bonjour tout le monde');
    expect(response).toEqual({
      id: 'question-1',
      text: 'Bonjour tout le monde',
      createdAt: '2026-10-20T10:41:00.000Z',
      author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
      hashtags: [],
      counters: { like: 0, dislike: 0, y: 0, reply: 0 },
      yThreshold: 50,
      conversationOpen: false,
      viewerReactions: [],
      viewerSaved: false,
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
      expect(keys.save).toHaveBeenCalledWith(
        'tx',
        expect.objectContaining({ key: 'key-1', requestHash: HASH_BONJOUR }),
      );
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

      await expect(service.create(AUTHOR, dto('Autre texte'), 'key-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns the response of a concurrent request that stored the same key first', async () => {
      const winner = { id: 'question-winner', text: 'Bonjour' };
      keys.find.mockResolvedValueOnce(null).mockResolvedValueOnce({
        requestHash: HASH_BONJOUR,
        response: winner,
        expiresAt: LIVE_KEY_EXPIRY,
      } as never);
      prisma.$transaction.mockRejectedValueOnce(uniqueViolation());

      await expect(service.create(AUTHOR, dto('Bonjour'), 'key-1')).resolves.toEqual(winner);
    });

    it('rethrows an error that is not a unique violation', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));

      await expect(service.create(AUTHOR, dto('Bonjour'), 'key-1')).rejects.toThrow('connection lost');
    });

    it('refuses an empty key (400) and a key over 255 characters (400), before any write', async () => {
      await expect(service.create(AUTHOR, dto('Bonjour'), '')).rejects.toThrow(BadRequestException);
      await expect(service.create(AUTHOR, dto('Bonjour'), 'k'.repeat(256))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

type DetailRepository = jest.Mocked<Pick<QuestionsRepository, 'findVisibleQuestion' | 'findViewerReactions' | 'findViewerSaved' | 'findFollowedAuthorIds'>>;
type VisibleRow = NonNullable<Awaited<ReturnType<QuestionsRepository['findVisibleQuestion']>>>;

describe('QuestionsService.findVisible (M3, F11, R13, R14)', () => {
  const VIEWER: SessionUser = {
    id: 'viewer-1',
    handle: 'bob',
    displayName: 'Bob',
    role: 'user',
    status: 'active',
  };

  let repository: DetailRepository;
  let service: QuestionsService;

  function visibleRow(overrides: Partial<VisibleRow> = {}): VisibleRow {
    return {
      id: 'question-1',
      body: 'Bonjour #irl',
      createdAt: CREATED_AT,
      likeCount: 2,
      dislikeCount: 0,
      yCount: 3,
      replyCount: 1,
      conversationOpenedAt: CREATED_AT,
      authorId: 'author-1',
      author: { handle: 'alice', displayName: 'Alice' },
      hashtags: [{ hashtag: { name: 'irl' } }],
      ...overrides,
    } as unknown as VisibleRow;
  }

  beforeEach(() => {
    repository = {
      findVisibleQuestion: jest.fn().mockResolvedValue(visibleRow()),
      findViewerReactions: jest.fn().mockResolvedValue([]),
      findViewerSaved: jest.fn().mockResolvedValue([]),
      findFollowedAuthorIds: jest.fn().mockResolvedValue([]),
    } as unknown as DetailRepository;
    const prisma = { $transaction: jest.fn() };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    const idempotency = {} as IdempotencyService;
    const mentions = { resolve: jest.fn(), record: jest.fn() };
    service = new QuestionsService(
      prisma as unknown as PrismaService,
      repository as unknown as QuestionsRepository,
      idempotency,
      config,
      mentions as unknown as MentionsService,
    );
  });

  it('says the viewer saved the question when a saved row exists (viewerSaved, L4)', async () => {
    repository.findViewerSaved.mockResolvedValue([{ questionId: 'question-1' }] as never);

    const response = await service.findVisible(VIEWER, 'question-1');

    expect(repository.findViewerSaved).toHaveBeenCalledWith('viewer-1', ['question-1']);
    expect(response.viewerSaved).toBe(true);
  });

  it('returns the question as the feed does: counters, Y progress and the viewer reaction', async () => {
    repository.findViewerReactions.mockResolvedValue([{ questionId: 'question-1', kind: 'y' }] as never);

    const response = await service.findVisible(VIEWER, 'question-1');

    expect(repository.findVisibleQuestion).toHaveBeenCalledWith('viewer-1', 'question-1');
    expect(repository.findViewerReactions).toHaveBeenCalledWith('viewer-1', ['question-1']);
    expect(response).toEqual({
      id: 'question-1',
      text: 'Bonjour #irl',
      createdAt: '2026-10-20T10:41:00.000Z',
      author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
      hashtags: ['irl'],
      counters: { like: 2, dislike: 0, y: 3, reply: 1 },
      yThreshold: 50,
      conversationOpen: true,
      viewerReactions: ['y'],
      viewerSaved: false,
    });
  });

  it('says the viewer follows the author when a follow exists (L3)', async () => {
    repository.findFollowedAuthorIds.mockResolvedValue([{ followeeId: 'author-1' }] as never);

    const response = await service.findVisible(VIEWER, 'question-1');

    expect(repository.findFollowedAuthorIds).toHaveBeenCalledWith('viewer-1', ['author-1']);
    expect(response.author.viewerFollows).toBe(true);
  });

  it('shows the conversation as closed and no reaction when the viewer has none', async () => {
    repository.findVisibleQuestion.mockResolvedValue(visibleRow({ conversationOpenedAt: null, yCount: 12 }));

    const response = await service.findVisible(VIEWER, 'question-1');

    expect(response).toMatchObject({ conversationOpen: false, viewerReactions: [] });
  });

  // The repository applies visibleTo, so hidden, deleted, blocked and inactive questions all come back as null.
  it.each(['hidden', 'deleted', 'blocked', 'inactive'])(
    'answers 404 when the question is %s, and reads no reaction',
    async () => {
      repository.findVisibleQuestion.mockResolvedValue(null);

      await expect(service.findVisible(VIEWER, 'question-1')).rejects.toThrow(NotFoundException);
      await expect(service.findVisible(VIEWER, 'question-1')).rejects.toThrow('Question introuvable.');
      expect(repository.findViewerReactions).not.toHaveBeenCalled();
    },
  );
});
