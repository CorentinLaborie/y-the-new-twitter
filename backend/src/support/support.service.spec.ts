import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { PrismaService } from '../database/prisma.service';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

type Repository = jest.Mocked<
  Pick<
    SupportRepository,
    | 'lockAccountStatus'
    | 'lockReferenceNumbering'
    | 'findOpenThread'
    | 'findLastReference'
    | 'createThread'
    | 'markNew'
    | 'createUserMessage'
  >
>;

const VIEWER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'suspended',
};
const NOW = new Date('2026-10-19T10:00:00Z');

describe('SupportService.sendMessage (section 3.4, DEC-078, DEC-116)', () => {
  let repository: Repository;
  let prisma: { $transaction: jest.Mock };
  let service: SupportService;

  beforeEach(() => {
    repository = {
      lockAccountStatus: jest.fn().mockResolvedValue('suspended'),
      lockReferenceNumbering: jest.fn().mockResolvedValue(undefined),
      findOpenThread: jest.fn().mockResolvedValue(null),
      findLastReference: jest.fn().mockResolvedValue(null),
      createThread: jest.fn().mockResolvedValue({ id: 'thread-new', reference: 'CNT-20261019-0001' }),
      markNew: jest.fn().mockResolvedValue(undefined),
      createUserMessage: jest.fn().mockResolvedValue(undefined),
    };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx')) };
    service = new SupportService(
      prisma as unknown as PrismaService,
      repository as unknown as SupportRepository,
    );
  });

  it('opens a new thread with the next reference of the day when the account has none open', async () => {
    repository.findLastReference.mockResolvedValue('CNT-20261019-0417');
    repository.createThread.mockResolvedValue({ id: 'thread-new', reference: 'CNT-20261019-0418' });

    const response = await service.sendMessage(VIEWER, { text: 'Bonjour' }, NOW);

    expect(repository.lockReferenceNumbering).toHaveBeenCalledWith('tx');
    expect(repository.findLastReference).toHaveBeenCalledWith('tx', 'CNT-20261019-');
    expect(repository.createThread).toHaveBeenCalledWith('tx', 'CNT-20261019-0418', 'user-1');
    expect(repository.createUserMessage).toHaveBeenCalledWith('tx', 'thread-new', 'user-1', 'Bonjour');
    expect(response).toEqual({ reference: 'CNT-20261019-0418' });
  });

  it('adds the message to the open thread and does not open another one (DEC-116)', async () => {
    repository.findOpenThread.mockResolvedValue({ id: 'thread-open', reference: 'CNT-20261018-0003' });

    const response = await service.sendMessage(VIEWER, { text: 'Encore moi' }, NOW);

    expect(repository.createThread).not.toHaveBeenCalled();
    expect(repository.lockReferenceNumbering).not.toHaveBeenCalled();
    expect(repository.createUserMessage).toHaveBeenCalledWith('tx', 'thread-open', 'user-1', 'Encore moi');
    expect(response).toEqual({ reference: 'CNT-20261018-0003' });
  });

  it('puts an open thread back to new when the administrator had replied (DEC-116, case 1)', async () => {
    repository.findOpenThread.mockResolvedValue({ id: 'thread-replied', reference: 'CNT-20261018-0003' });

    await service.sendMessage(VIEWER, { text: 'Merci de la réponse, une précision' }, NOW);

    expect(repository.markNew).toHaveBeenCalledWith('tx', 'thread-replied', 'user-1');
  });

  it('stores the text trimmed, and counts it in characters', async () => {
    await service.sendMessage(VIEWER, { text: '  Bonjour  \n' }, NOW);

    expect(repository.createUserMessage).toHaveBeenCalledWith('tx', 'thread-new', 'user-1', 'Bonjour');
  });

  it('accepts a text of exactly 1000 characters', async () => {
    await expect(service.sendMessage(VIEWER, { text: 'a'.repeat(1000) }, NOW)).resolves.toBeDefined();
  });

  it('refuses a text of 1001 characters with 422, and writes nothing', async () => {
    await expect(service.sendMessage(VIEWER, { text: 'a'.repeat(1001) }, NOW)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an empty text, or one of spaces only, with 422', async () => {
    await expect(service.sendMessage(VIEWER, { text: '   ' }, NOW)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the status under the account lock, before it reads or writes a thread (DEC-086)', async () => {
    await service.sendMessage(VIEWER, { text: 'Bonjour' }, NOW);

    expect(repository.lockAccountStatus).toHaveBeenCalledWith('tx', 'user-1');
    expect(repository.lockAccountStatus.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findOpenThread.mock.invocationCallOrder[0],
    );
  });

  it('refuses an account that is no longer suspended under the lock, and writes nothing', async () => {
    repository.lockAccountStatus.mockResolvedValue('active');

    await expect(service.sendMessage(VIEWER, { text: 'Bonjour' }, NOW)).rejects.toThrow(ForbiddenException);
    expect(repository.findOpenThread).not.toHaveBeenCalled();
    expect(repository.createThread).not.toHaveBeenCalled();
    expect(repository.createUserMessage).not.toHaveBeenCalled();
  });
});
