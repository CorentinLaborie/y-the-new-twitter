import { FollowsRepository, type FollowsDb } from './follows.repository';
import { visibleAccountTo } from '../users/account-visibility';

/** The SQL of a tagged template, so the lock clause can be checked in the text. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?');
}

describe('FollowsRepository (E1, E2, E5)', () => {
  let db: {
    follow: { createMany: jest.Mock; deleteMany: jest.Mock; findMany: jest.Mock };
    notification: { create: jest.Mock };
    user: { findFirst: jest.Mock; update: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let repository: FollowsRepository;

  beforeEach(() => {
    db = {
      follow: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'active' }]),
    };
    repository = new FollowsRepository();
  });

  describe('lockAccounts (section 6.3)', () => {
    it('locks each account once, exclusively, in the order of the ids, whatever the order they are given in', async () => {
      const statuses = await repository.lockAccounts(db as unknown as FollowsDb, ['b-id', 'a-id', 'b-id']);

      // The graph lock is taken first (one call), then each row, in the order of the ids.
      expect(db.$queryRaw).toHaveBeenCalledTimes(3);
      expect(db.$queryRaw.mock.calls.slice(1).map((call) => call[1])).toEqual(['a-id', 'b-id']);
      expect(sqlOf(db.$queryRaw.mock.calls[1])).toContain('FOR UPDATE');
      expect(statuses).toEqual(
        new Map([
          ['a-id', 'active'],
          ['b-id', 'active'],
        ]),
      );
    });

    it('leaves out an account that does not exist', async () => {
      // The first answer is the graph lock; the second is the row lock of the account, which is missing.
      db.$queryRaw.mockResolvedValueOnce([{ locked: '' }]).mockResolvedValueOnce([]);

      const statuses = await repository.lockAccounts(db as unknown as FollowsDb, ['a-id']);

      expect(statuses.has('a-id')).toBe(false);
    });
  });

  describe('follow rows (E1, E2)', () => {
    it('creates the row with skipDuplicates, and says it is new only when one row was inserted', async () => {
      await expect(repository.createFollow(db as unknown as FollowsDb, 'viewer', 'target')).resolves.toBe(
        true,
      );
      expect(db.follow.createMany).toHaveBeenCalledWith({
        data: { followerId: 'viewer', followeeId: 'target' },
        skipDuplicates: true,
      });

      db.follow.createMany.mockResolvedValueOnce({ count: 0 });
      await expect(repository.createFollow(db as unknown as FollowsDb, 'viewer', 'target')).resolves.toBe(
        false,
      );
    });

    it('recounts the follow counters of both accounts from the rows, after locking them, active accounts only', async () => {
      const tx = {
        ...db,
        $executeRaw: jest.fn().mockResolvedValue(2),
      };

      await repository.recountCounters(tx as unknown as FollowsDb, 'viewer', 'target');

      expect(sqlOf(tx.$queryRaw.mock.calls[0])).toContain('FOR UPDATE');
      expect(sqlOf(tx.$executeRaw.mock.calls[0])).toContain("a.status = 'active'");
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it('writes the follow notice to the followed account, with the viewer as the actor and no question', async () => {
      await repository.writeFollowNotification(db as unknown as FollowsDb, 'target', 'viewer');

      expect(db.notification.create).toHaveBeenCalledWith({
        data: { recipientId: 'target', actorId: 'viewer', type: 'follow' },
      });
    });

    it('deletes the row of one direction only', async () => {
      await repository.deleteFollow(db as unknown as FollowsDb, 'viewer', 'target');

      expect(db.follow.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'viewer', followeeId: 'target' },
      });
    });
  });

  describe('account visibility', () => {
    it('finds an account by handle whatever its status, regardless of case (DEC-061)', async () => {
      await repository.findAccountByHandle(db as unknown as FollowsDb, 'Bob');

      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: { handle: { equals: 'Bob', mode: 'insensitive' } },
        select: { id: true, handle: true },
      });
    });

    it('reads an account only when it is visible to the viewer (R13, R14)', async () => {
      await repository.findVisibleAccount(db as unknown as FollowsDb, 'viewer', { id: 'target' });

      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: { AND: [{ id: 'target' }, visibleAccountTo('viewer')] },
        select: { id: true, handle: true },
      });
    });
  });

  describe('lists (E5)', () => {
    const at = new Date('2026-10-20T10:00:00.000Z');

    it('reads the followers of the owner, and leaves out an account that is not active or is blocked with the owner or the viewer (R13, R14)', async () => {
      await repository.findFollowerPage(db as unknown as FollowsDb, {
        ownerId: 'owner',
        viewerId: 'viewer',
        after: undefined,
        take: 21,
      });

      const args = db.follow.findMany.mock.calls[0][0];
      expect(args.where.AND[0]).toEqual({ followeeId: 'owner' });
      expect(args.where.AND[1]).toEqual({
        follower: { AND: [visibleAccountTo('viewer'), visibleAccountTo('owner')] },
      });
      expect(args.where.AND[2]).toEqual({});
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { followerId: 'desc' }]);
      expect(args.take).toBe(21);
    });

    it('reads the accounts the owner follows, with the same exclusions', async () => {
      await repository.findFollowingPage(db as unknown as FollowsDb, {
        ownerId: 'owner',
        viewerId: 'viewer',
        after: undefined,
        take: 21,
      });

      const args = db.follow.findMany.mock.calls[0][0];
      expect(args.where.AND[0]).toEqual({ followerId: 'owner' });
      expect(args.where.AND[1]).toEqual({
        followee: { AND: [visibleAccountTo('viewer'), visibleAccountTo('owner')] },
      });
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { followeeId: 'desc' }]);
    });

    it('continues after the position of the cursor, on the date first and then on the account id', async () => {
      await repository.findFollowerPage(db as unknown as FollowsDb, {
        ownerId: 'owner',
        viewerId: 'viewer',
        after: { createdAt: at, id: 'account-5' },
        take: 21,
      });

      expect(db.follow.findMany.mock.calls[0][0].where.AND[2]).toEqual({
        OR: [{ createdAt: { lt: at } }, { createdAt: at, followerId: { lt: 'account-5' } }],
      });
    });

    it('returns each row with the account of the list, its handle and display name', async () => {
      db.follow.findMany.mockResolvedValue([
        {
          createdAt: at,
          followerId: 'account-1',
          follower: { handle: 'carol', displayName: 'Carol' },
        },
      ]);

      await expect(
        repository.findFollowerPage(db as unknown as FollowsDb, {
          ownerId: 'owner',
          viewerId: 'viewer',
          after: undefined,
          take: 21,
        }),
      ).resolves.toEqual([{ createdAt: at, accountId: 'account-1', handle: 'carol', displayName: 'Carol' }]);
    });
  });
});
