import type { PrismaService } from '../database/prisma.service';
import { recalculateCounters } from './recalculate-counters';
import { UsersRepository } from './users.repository';

/** The SQL of a tagged template, joined with a placeholder per value, so the rule can be checked in the text. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?');
}

describe('UsersRepository counters (R13)', () => {
  let tx: {
    user: { update: jest.Mock };
    follow: { findMany: jest.Mock };
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let repository: UsersRepository;

  beforeEach(() => {
    tx = {
      user: { update: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      follow: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'active' }]),
    };
    repository = new UsersRepository({} as PrismaService);
  });

  describe('activate', () => {
    it('writes the active status, then recalculates the counters, in the same transaction', async () => {
      const at = new Date('2026-10-20T10:00:00Z');

      await repository.activate(tx as never, 'user-1', at);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'active', emailVerifiedAt: at, statusChangedAt: at },
      });
      expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
      expect(tx.user.update.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$executeRaw.mock.invocationCallOrder[0],
      );
    });
  });

  describe('recalculateCounters', () => {
    it('counts only active accounts in the question counters, and the replies that are not deleted', async () => {
      await recalculateCounters(tx as never, 'user-1');

      const questionSql = sqlOf(tx.$executeRaw.mock.calls[1]);
      expect(questionSql).toContain('UPDATE questions');
      expect(questionSql.match(/u\.status = 'active'/g)).toHaveLength(4);
      expect(questionSql).toContain('rp.deleted_at IS NULL');
      expect(questionSql).toContain("r.kind = 'y'");
    });

    it('counts only active accounts in the like and dislike counts of the replies', async () => {
      await recalculateCounters(tx as never, 'user-1');

      const replySql = sqlOf(tx.$executeRaw.mock.calls[0]);
      expect(replySql).toContain('UPDATE replies');
      expect(replySql.match(/u\.status = 'active'/g)).toHaveLength(2);
    });

    it('updates the replies before the questions, the order of a reply deletion (no deadlock)', async () => {
      await recalculateCounters(tx as never, 'user-1');

      expect(sqlOf(tx.$executeRaw.mock.calls[0])).toContain('UPDATE replies');
      expect(sqlOf(tx.$executeRaw.mock.calls[1])).toContain('UPDATE questions');
    });

    it('recounts the follow counters of this account and of its links, counting only active accounts, after locking them', async () => {
      tx.follow.findMany.mockResolvedValueOnce([{ followerId: 'user-2', followeeId: 'user-1' }]);

      await recalculateCounters(tx as never, 'user-1');

      expect(sqlOf(tx.$queryRaw.mock.calls[0])).toContain('FOR UPDATE');
      const followSql = sqlOf(tx.$executeRaw.mock.calls[2]);
      expect(followSql).toContain('UPDATE users');
      expect(followSql).toContain('follower_count');
      expect(followSql).toContain('following_count');
      expect(followSql.match(/a\.status = 'active'/g)).toHaveLength(2);
    });

    it('limits both statements to the questions and replies this account touched', async () => {
      await recalculateCounters(tx as never, 'user-1');

      const replySql = sqlOf(tx.$executeRaw.mock.calls[0]);
      const questionSql = sqlOf(tx.$executeRaw.mock.calls[1]);
      expect(questionSql).toContain('WHERE q.id IN (');
      expect(replySql).toContain('WHERE rp.id IN (');
      expect(tx.$executeRaw.mock.calls[1].slice(1)).toEqual(['user-1', 'user-1']);
      expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual(['user-1']);
    });
  });

  describe('lockActiveAccount', () => {
    it('answers true only when the account is active under the lock', async () => {
      await expect(repository.lockActiveAccount(tx as never, 'user-1')).resolves.toBe(true);
      expect(sqlOf(tx.$queryRaw.mock.calls[0])).toContain('FOR SHARE');
    });

    it.each([
      ['suspended', [{ status: 'suspended' }]],
      ['pending deletion', [{ status: 'pending_deletion' }]],
      ['deleted', [{ status: 'deleted' }]],
      ['missing', []],
    ])('answers false for a %s account', async (_label, rows) => {
      tx.$queryRaw.mockResolvedValue(rows);

      await expect(repository.lockActiveAccount(tx as never, 'user-1')).resolves.toBe(false);
    });
  });
});
