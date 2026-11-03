import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { PrismaService } from '../database/prisma.service';
import { BlocksRepository } from './blocks.repository';
import { BLOCK_TARGET_NOT_FOUND, BlocksService } from './blocks.service';

type Repository = jest.Mocked<
  Pick<
    BlocksRepository,
    | 'findAccountByHandle'
    | 'lockAccounts'
    | 'createBlock'
    | 'deleteBlock'
    | 'removeFollowsBetween'
    | 'findBlockPage'
  >
>;

const VIEWER: SessionUser = {
  id: 'viewer-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};
const TARGET = { id: 'target-1', handle: 'bob', status: 'active' as const };
const DB = 'tx';

describe('BlocksService (L6, S2)', () => {
  let repository: Repository;
  let prisma: { $transaction: jest.Mock };
  let service: BlocksService;

  beforeEach(() => {
    repository = {
      findAccountByHandle: jest.fn().mockResolvedValue(TARGET),
      lockAccounts: jest.fn().mockResolvedValue(
        new Map([
          [VIEWER.id, 'active'],
          [TARGET.id, 'active'],
        ]),
      ),
      createBlock: jest.fn().mockResolvedValue(true),
      deleteBlock: jest.fn().mockResolvedValue({ count: 1 }),
      removeFollowsBetween: jest.fn().mockResolvedValue(undefined),
      findBlockPage: jest.fn().mockResolvedValue([]),
    };
    prisma = { $transaction: jest.fn((write) => write(DB)) };
    service = new BlocksService(
      prisma as unknown as PrismaService,
      repository as unknown as BlocksRepository,
    );
  });

  describe('block', () => {
    it('blocks an active account and removes the follows between the two (R14)', async () => {
      await service.block(VIEWER, 'bob');

      expect(repository.createBlock).toHaveBeenCalledWith(DB, VIEWER.id, TARGET.id);
      expect(repository.removeFollowsBetween).toHaveBeenCalledWith(DB, VIEWER.id, TARGET.id);
    });

    it('blocking twice removes no follow a second time', async () => {
      repository.createBlock.mockResolvedValue(false);

      await service.block(VIEWER, 'bob');

      expect(repository.removeFollowsBetween).not.toHaveBeenCalled();
    });

    it('answers an unknown account as not found (404)', async () => {
      repository.findAccountByHandle.mockResolvedValue(null);

      await expect(service.block(VIEWER, 'nobody')).rejects.toThrow(NotFoundException);
    });

    it('answers an inactive account as not found (404), with nothing written', async () => {
      repository.findAccountByHandle.mockResolvedValue({ ...TARGET, status: 'suspended' });

      await expect(service.block(VIEWER, 'bob')).rejects.toThrow(
        new NotFoundException(BLOCK_TARGET_NOT_FOUND),
      );
      expect(repository.createBlock).not.toHaveBeenCalled();
    });

    it('refuses to block one’s own account (422)', async () => {
      repository.findAccountByHandle.mockResolvedValue({ ...TARGET, id: VIEWER.id });

      await expect(service.block(VIEWER, 'alice')).rejects.toThrow(UnprocessableEntityException);
      expect(repository.createBlock).not.toHaveBeenCalled();
    });

    it('refuses a viewer whose account is not active any more (403), with nothing written', async () => {
      repository.lockAccounts.mockResolvedValue(
        new Map([
          [VIEWER.id, 'suspended'],
          [TARGET.id, 'active'],
        ]),
      );

      await expect(service.block(VIEWER, 'bob')).rejects.toThrow(ForbiddenException);
      expect(repository.createBlock).not.toHaveBeenCalled();
    });

    it('re-checks the target under the lock: an account made inactive meanwhile is not found (404)', async () => {
      repository.lockAccounts.mockResolvedValue(
        new Map([
          [VIEWER.id, 'active'],
          [TARGET.id, 'suspended'],
        ]),
      );

      await expect(service.block(VIEWER, 'bob')).rejects.toThrow(NotFoundException);
      expect(repository.createBlock).not.toHaveBeenCalled();
    });
  });

  describe('unblock', () => {
    it('lifts the block of a known account', async () => {
      await service.unblock(VIEWER, 'bob');

      expect(repository.deleteBlock).toHaveBeenCalledWith(DB, VIEWER.id, TARGET.id);
    });

    it('answers the same way for an unknown handle, and writes nothing', async () => {
      repository.findAccountByHandle.mockResolvedValue(null);

      await expect(service.unblock(VIEWER, 'nobody')).resolves.toBeUndefined();
      expect(repository.deleteBlock).not.toHaveBeenCalled();
    });

    it('refuses a viewer whose account is not active any more (403)', async () => {
      repository.lockAccounts.mockResolvedValue(new Map([[VIEWER.id, 'pending_deletion']]));

      await expect(service.unblock(VIEWER, 'bob')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('returns the blocked accounts, most recent first, with the cursor of the next page', async () => {
      const blockedAt = new Date('2026-10-23T09:00:00.000Z');
      repository.findBlockPage.mockResolvedValue([
        {
          createdAt: blockedAt,
          blockedId: 'target-1',
          blocked: { handle: 'bob', displayName: 'Bob', avatarUrl: null },
        },
        {
          createdAt: new Date('2026-10-22T09:00:00.000Z'),
          blockedId: 'target-2',
          blocked: { handle: 'carol', displayName: 'Carol' },
        },
      ] as never);

      const page = await service.list(VIEWER, { limit: 1 } as never);

      expect(page).toEqual({
        items: [{ handle: 'bob', displayName: 'Bob', avatarUrl: null, blockedAt }],
        nextCursor: encodeKeysetCursor({ createdAt: blockedAt, id: 'target-1' }),
      });
    });

    it('returns no cursor on the last page', async () => {
      repository.findBlockPage.mockResolvedValue([
        {
          createdAt: new Date(),
          blockedId: 'target-1',
          blocked: { handle: 'bob', displayName: 'Bob', avatarUrl: null },
        },
      ] as never);

      const page = await service.list(VIEWER, { limit: 20 } as never);

      expect(page.nextCursor).toBeNull();
    });
  });
});
