import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { PrismaService } from '../database/prisma.service';
import { FollowsRepository } from './follows.repository';
import { FollowsService } from './follows.service';

type Repository = jest.Mocked<
  Pick<
    FollowsRepository,
    | 'findAccountByHandle'
    | 'findVisibleAccount'
    | 'lockAccounts'
    | 'createFollow'
    | 'writeFollowNotification'
    | 'deleteFollow'
    | 'recountCounters'
    | 'findFollowerPage'
    | 'findFollowingPage'
    | 'findFollowedIds'
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
const TARGET = { id: 'target-1', handle: 'bob' };
const DB = 'tx';

function activeLocks(): Map<string, 'active' | 'suspended'> {
  return new Map([
    ['viewer-1', 'active'],
    ['target-1', 'active'],
  ]);
}

describe('FollowsService (E1, E2, E5)', () => {
  let repository: Repository;
  let prisma: { $transaction: jest.Mock };
  let service: FollowsService;

  beforeEach(() => {
    repository = {
      findAccountByHandle: jest.fn().mockResolvedValue(TARGET),
      findVisibleAccount: jest.fn().mockResolvedValue(TARGET),
      lockAccounts: jest.fn().mockResolvedValue(activeLocks()),
      createFollow: jest.fn().mockResolvedValue(true),
      writeFollowNotification: jest.fn().mockResolvedValue(undefined),
      deleteFollow: jest.fn().mockResolvedValue({ count: 1 }),
      recountCounters: jest.fn().mockResolvedValue(undefined),
      findFollowerPage: jest.fn().mockResolvedValue([]),
      findFollowingPage: jest.fn().mockResolvedValue([]),
      findFollowedIds: jest.fn().mockResolvedValue(new Set<string>()),
    };
    prisma = { $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(DB)) };
    service = new FollowsService(
      prisma as unknown as PrismaService,
      repository as unknown as FollowsRepository,
    );
  });

  describe('follow (E1)', () => {
    it('creates the follow and writes one follow notice to the followed account (R18 digest)', async () => {
      const response = await service.follow(VIEWER, 'bob');

      expect(repository.createFollow).toHaveBeenCalledWith(DB, 'viewer-1', 'target-1');
      expect(repository.writeFollowNotification).toHaveBeenCalledWith(DB, 'target-1', 'viewer-1');
      expect(response).toEqual({ handle: 'bob', viewerFollows: true });
    });

    it('recounts the follow counters of both accounts, in the same transaction', async () => {
      await service.follow(VIEWER, 'bob');

      expect(repository.recountCounters).toHaveBeenCalledWith(DB, 'viewer-1', 'target-1');
    });

    it('leaves the counters alone when the follow exists already', async () => {
      repository.createFollow.mockResolvedValue(false);

      await service.follow(VIEWER, 'bob');

      expect(repository.recountCounters).not.toHaveBeenCalled();
    });

    it('writes no notice when the follow exists already, and answers the same (idempotence)', async () => {
      repository.createFollow.mockResolvedValue(false);

      const response = await service.follow(VIEWER, 'bob');

      expect(repository.writeFollowNotification).not.toHaveBeenCalled();
      expect(response).toEqual({ handle: 'bob', viewerFollows: true });
    });

    it('locks the viewer and the target before it checks the target and writes (section 6.3)', async () => {
      await service.follow(VIEWER, 'bob');

      expect(repository.lockAccounts).toHaveBeenCalledWith(DB, ['viewer-1', 'target-1']);
      expect(repository.lockAccounts.mock.invocationCallOrder[0]).toBeLessThan(
        repository.findVisibleAccount.mock.invocationCallOrder[0],
      );
      expect(repository.findVisibleAccount.mock.invocationCallOrder[0]).toBeLessThan(
        repository.createFollow.mock.invocationCallOrder[0],
      );
    });

    it('refuses to follow oneself (422) before any lock or write', async () => {
      repository.findAccountByHandle.mockResolvedValue({ id: 'viewer-1', handle: 'alice' });

      await expect(service.follow(VIEWER, 'alice')).rejects.toThrow(UnprocessableEntityException);
      expect(repository.lockAccounts).not.toHaveBeenCalled();
      expect(repository.createFollow).not.toHaveBeenCalled();
    });


    it('answers 404 for a target that is not visible under the lock (inactive, deleted or blocked), and writes nothing (R13, R14)', async () => {
      repository.findVisibleAccount.mockResolvedValue(null);

      await expect(service.follow(VIEWER, 'bob')).rejects.toThrow(NotFoundException);
      expect(repository.createFollow).not.toHaveBeenCalled();
      expect(repository.writeFollowNotification).not.toHaveBeenCalled();
    });

    it('refuses a viewer whose account is no longer active under the lock (403), and writes nothing (R13)', async () => {
      repository.lockAccounts.mockResolvedValue(
        new Map([
          ['viewer-1', 'suspended'],
          ['target-1', 'active'],
        ]),
      );

      await expect(service.follow(VIEWER, 'bob')).rejects.toThrow(ForbiddenException);
      expect(repository.createFollow).not.toHaveBeenCalled();
    });
  });

  describe('unfollow (E2)', () => {
    it('removes the follow row of the viewer toward the account (204)', async () => {
      await service.unfollow(VIEWER, 'bob');

      expect(repository.deleteFollow).toHaveBeenCalledWith(DB, 'viewer-1', 'target-1');
    });

    it('removes the row when the target became inactive, suspended or blocked, and changes nothing else (204)', async () => {
      repository.findVisibleAccount.mockResolvedValue(null);

      await expect(service.unfollow(VIEWER, 'bob')).resolves.toBeUndefined();
      expect(repository.deleteFollow).toHaveBeenCalledWith(DB, 'viewer-1', 'target-1');
      expect(repository.createFollow).not.toHaveBeenCalled();
      expect(repository.writeFollowNotification).not.toHaveBeenCalled();
    });

    it('recounts the follow counters when a row was removed', async () => {
      await service.unfollow(VIEWER, 'bob');

      expect(repository.recountCounters).toHaveBeenCalledWith(DB, 'viewer-1', 'target-1');
    });

    it('leaves the counters alone when there was no follow to remove', async () => {
      repository.deleteFollow.mockResolvedValue({ count: 0 });

      await service.unfollow(VIEWER, 'bob');

      expect(repository.recountCounters).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown handle only', async () => {
      repository.findAccountByHandle.mockResolvedValue(null);

      await expect(service.unfollow(VIEWER, 'nobody')).rejects.toThrow(NotFoundException);
      expect(repository.deleteFollow).not.toHaveBeenCalled();
    });

    it('refuses a viewer whose account is not active under the lock (403), and removes nothing', async () => {
      repository.lockAccounts.mockResolvedValue(new Map([['viewer-1', 'pending_deletion' as 'suspended']]));

      await expect(service.unfollow(VIEWER, 'bob')).rejects.toThrow(ForbiddenException);
      expect(repository.deleteFollow).not.toHaveBeenCalled();
    });
  });

  describe('lists (E5)', () => {
    const at = (iso: string) => new Date(iso);

    it('gives the address of each listed account photo (DEC-351)', async () => {
      repository.findFollowerPage.mockResolvedValue([
        {
          createdAt: at('2026-10-20T10:00:02.000Z'),
          accountId: 'a-9',
          handle: 'eve',
          displayName: 'Eve',
          avatarUrl: '/avatars/eve.jpg',
        },
      ]);
      repository.findFollowedIds.mockResolvedValue(new Set());

      const page = await service.listFollowers(VIEWER, 'bob', { limit: 20 });

      expect(page.items[0]).toMatchObject({ handle: 'eve', avatarUrl: '/avatars/eve.jpg' });
    });

    it('says for each account of a list whether the viewer follows it', async () => {
      repository.findFollowerPage.mockResolvedValue([
        {
          createdAt: at('2026-10-20T10:00:02.000Z'),
          accountId: 'a-2',
          handle: 'dan',
          displayName: 'Dan',
          avatarUrl: null,
        },
      ]);
      repository.findFollowedIds.mockResolvedValue(new Set(['a-2']));

      const page = await service.listFollowers(VIEWER, 'bob', { limit: 20 });

      expect(repository.findFollowedIds).toHaveBeenCalledWith(prisma, 'viewer-1', ['a-2']);
      expect(page.items).toEqual([
        { handle: 'dan', displayName: 'Dan', avatarUrl: null, viewerFollows: true },
      ]);
    });

    it('returns the accounts in the author format, newest follow first, with the next cursor of the last shown row', async () => {
      repository.findFollowerPage.mockResolvedValue([
        {
          createdAt: at('2026-10-20T10:00:03.000Z'),
          accountId: 'a-3',
          handle: 'carol',
          displayName: 'Carol',
          avatarUrl: null,
        },
        {
          createdAt: at('2026-10-20T10:00:02.000Z'),
          accountId: 'a-2',
          handle: 'dan',
          displayName: 'Dan',
          avatarUrl: null,
        },
        {
          createdAt: at('2026-10-20T10:00:01.000Z'),
          accountId: 'a-1',
          handle: 'erin',
          displayName: 'Erin',
          avatarUrl: null,
        },
      ]);

      const page = await service.listFollowers(VIEWER, 'bob', { limit: 2 });

      expect(page).toEqual({
        items: [
          { handle: 'carol', displayName: 'Carol', avatarUrl: null, viewerFollows: false },
          { handle: 'dan', displayName: 'Dan', avatarUrl: null, viewerFollows: false },
        ],
        nextCursor: encodeKeysetCursor({ createdAt: at('2026-10-20T10:00:02.000Z'), id: 'a-2' }),
      });
      expect(repository.findFollowerPage).toHaveBeenCalledWith(prisma, {
        ownerId: 'target-1',
        viewerId: 'viewer-1',
        after: undefined,
        take: 3,
      });
    });

    it('has no next cursor on the last page', async () => {
      repository.findFollowingPage.mockResolvedValue([
        {
          createdAt: at('2026-10-20T10:00:01.000Z'),
          accountId: 'a-1',
          handle: 'erin',
          displayName: 'Erin',
          avatarUrl: null,
        },
      ]);

      const page = await service.listFollowing(VIEWER, 'bob', { limit: 20 });

      expect(page).toEqual({
        items: [{ handle: 'erin', displayName: 'Erin', avatarUrl: null, viewerFollows: false }],
        nextCursor: null,
      });
    });

    it('reads the page after the cursor it is given', async () => {
      const lastId = '5f0c2b1e-7a9d-4c3e-8b1f-2d6e9a0c4b7f';
      const cursor = encodeKeysetCursor({ createdAt: at('2026-10-20T10:00:02.000Z'), id: lastId });

      await service.listFollowing(VIEWER, 'bob', { cursor, limit: 20 });

      expect(repository.findFollowingPage).toHaveBeenCalledWith(prisma, {
        ownerId: 'target-1',
        viewerId: 'viewer-1',
        after: { createdAt: at('2026-10-20T10:00:02.000Z'), id: lastId },
        take: 21,
      });
    });

    it('refuses a cursor that is not a cursor (400)', async () => {
      await expect(service.listFollowers(VIEWER, 'bob', { cursor: 'nope', limit: 20 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('answers 404 when the account whose list is read is not visible to the viewer (R13, R14)', async () => {
      repository.findVisibleAccount.mockResolvedValue(null);

      await expect(service.listFollowers(VIEWER, 'bob', { limit: 20 })).rejects.toThrow(NotFoundException);
      await expect(service.listFollowing(VIEWER, 'bob', { limit: 20 })).rejects.toThrow(NotFoundException);
      expect(repository.findFollowerPage).not.toHaveBeenCalled();
      expect(repository.findFollowingPage).not.toHaveBeenCalled();
    });
  });
});
