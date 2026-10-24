import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { PrismaService } from '../database/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { UsersRepository } from '../users/users.repository';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

type Repository = jest.Mocked<
  Pick<ReportsRepository, 'findVisibleQuestion' | 'findVisibleReply' | 'createReport' | 'findOwnReport'>
>;
type Users = jest.Mocked<Pick<UsersRepository, 'lockActiveAccount'>>;
type Idempotency = jest.Mocked<Pick<IdempotencyService, 'run'>>;

const REPORTER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  role: 'user',
  status: 'active',
};
const QUESTION_ID = '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const REPLY_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const TX = { tag: 'transaction' };
const CREATED_AT = new Date('2026-10-23T10:00:00.000Z');

describe('ReportsService (L6, S1)', () => {
  let repository: Repository;
  let users: Users;
  let idempotency: Idempotency;
  let prisma: { $transaction: jest.Mock };
  let service: ReportsService;

  beforeEach(() => {
    repository = {
      findVisibleQuestion: jest.fn().mockResolvedValue({ id: QUESTION_ID, authorId: 'user-2' }),
      findVisibleReply: jest.fn().mockResolvedValue({ id: REPLY_ID, authorId: 'user-2' }),
      createReport: jest.fn().mockResolvedValue({ id: 'report-1', createdAt: CREATED_AT }),
      findOwnReport: jest.fn().mockResolvedValue(null),
    };
    users = { lockActiveAccount: jest.fn().mockResolvedValue(true) };
    idempotency = { run: jest.fn((_user, _key, _fingerprint, write) => write(TX)) } as unknown as Idempotency;
    prisma = { $transaction: jest.fn((write) => write(TX)) };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      repository as unknown as ReportsRepository,
      idempotency as unknown as IdempotencyService,
      users as unknown as UsersRepository,
    );
  });

  describe('target', () => {
    it('refuses a report with no target (400)', async () => {
      await expect(service.create(REPORTER, { reason: 'spam' } as never)).rejects.toThrow(BadRequestException);
    });

    it('treats a null target as absent: null plus a reply is one target, two nulls are none (400)', async () => {
      await expect(
        service.create(REPORTER, { questionId: null, replyId: REPLY_ID, reason: 'spam' } as never),
      ).resolves.toEqual(expect.objectContaining({ status: 'open' }));
      await expect(
        service.create(REPORTER, { questionId: null, replyId: null, reason: 'spam' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a report with both a question and a reply (400)', async () => {
      await expect(
        service.create(REPORTER, { questionId: QUESTION_ID, replyId: REPLY_ID, reason: 'spam' }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.createReport).not.toHaveBeenCalled();
    });
  });

  describe('details', () => {
    it('requires details when the reason is other (422)', async () => {
      await expect(service.create(REPORTER, { questionId: QUESTION_ID, reason: 'other' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('treats empty details as absent, so other still needs them (422)', async () => {
      await expect(
        service.create(REPORTER, { questionId: QUESTION_ID, reason: 'other', details: '' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('refuses details longer than 280 characters (422)', async () => {
      await expect(
        service.create(REPORTER, { questionId: QUESTION_ID, reason: 'other', details: 'a'.repeat(281) }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('stores no details for a reason that does not need them', async () => {
      await service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam', details: '' });

      expect(repository.createReport).toHaveBeenCalledWith(TX, expect.objectContaining({ details: null }));
    });

    it('treats null details as absent', async () => {
      await service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam', details: null } as never);

      expect(repository.createReport).toHaveBeenCalledWith(TX, expect.objectContaining({ details: null }));
    });
  });

  describe('visibility and ownership', () => {
    it('refuses a suspended or pending account before reading anything (403)', async () => {
      users.lockActiveAccount.mockResolvedValue(false);

      await expect(service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.findVisibleQuestion).not.toHaveBeenCalled();
    });

    it('answers a question that is not visible as missing (404)', async () => {
      repository.findVisibleQuestion.mockResolvedValue(null);

      await expect(service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.createReport).not.toHaveBeenCalled();
    });

    it('answers a reply that is not visible as missing (404)', async () => {
      repository.findVisibleReply.mockResolvedValue(null);

      await expect(service.create(REPORTER, { replyId: REPLY_ID, reason: 'spam' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to report one’s own question (422) without writing', async () => {
      repository.findVisibleQuestion.mockResolvedValue({ id: QUESTION_ID, authorId: REPORTER.id });

      await expect(service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam' })).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repository.createReport).not.toHaveBeenCalled();
    });
  });

  describe('recording', () => {
    it('records a question report as open, with no details for spam', async () => {
      const report = await service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam' });

      expect(repository.createReport).toHaveBeenCalledWith(TX, {
        reporterId: REPORTER.id,
        questionId: QUESTION_ID,
        replyId: null,
        reason: 'spam',
        details: null,
      });
      expect(report).toEqual({ id: 'report-1', status: 'open', createdAt: CREATED_AT });
    });

    it('records a reply report with its details', async () => {
      await service.create(REPORTER, { replyId: REPLY_ID, reason: 'other', details: 'Texte trompeur' });

      expect(repository.createReport).toHaveBeenCalledWith(TX, {
        reporterId: REPORTER.id,
        questionId: null,
        replyId: REPLY_ID,
        reason: 'other',
        details: 'Texte trompeur',
      });
    });

    it('writes no notification and returns the same shape for every reason', async () => {
      const report = await service.create(REPORTER, { questionId: QUESTION_ID, reason: 'harassment' });

      expect(Object.keys(report).sort()).toEqual(['createdAt', 'id', 'status']);
    });

    it('goes through the idempotency service when a key is given', async () => {
      const key = 'b7b1f3e2-4c5d-4e6f-8a9b-0c1d2e3f4a5b';

      await service.create(REPORTER, { questionId: QUESTION_ID, reason: 'spam' }, key);

      expect(idempotency.run).toHaveBeenCalledWith(REPORTER.id, key, expect.any(String), expect.any(Function));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
describe('reading (L6, read route)', () => {
    const OWN_ROW = {
      id: 'report-1',
      status: 'open',
      reason: 'spam',
      details: null,
      createdAt: CREATED_AT,
      questionId: QUESTION_ID,
      replyId: null,
    };

    it('returns the report of its author, with its target', async () => {
      repository.findOwnReport.mockResolvedValue(OWN_ROW);

      await expect(service.get(REPORTER, 'report-1')).resolves.toEqual({
        id: 'report-1',
        status: 'open',
        targetKind: 'question',
        targetId: QUESTION_ID,
        reason: 'spam',
        details: null,
        createdAt: CREATED_AT,
      });
      expect(repository.findOwnReport).toHaveBeenCalledWith(prisma, REPORTER.id, 'report-1');
    });

    it('answers a reply report with the reply as target', async () => {
      repository.findOwnReport.mockResolvedValue({ ...OWN_ROW, questionId: null, replyId: REPLY_ID });

      await expect(service.get(REPORTER, 'report-1')).resolves.toMatchObject({ targetKind: 'reply', targetId: REPLY_ID });
    });

    it('answers a report of another account, or an unknown id, as not found (404)', async () => {
      repository.findOwnReport.mockResolvedValue(null);

      await expect(service.get(REPORTER, 'report-1')).rejects.toThrow(NotFoundException);
    });
  });
});
