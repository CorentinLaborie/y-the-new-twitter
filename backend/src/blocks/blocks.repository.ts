import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../database/generated/client/client';
import type { KeysetPosition } from '../common/pagination/keyset-cursor';
import { lockAccountGraphShared } from '../users/account-graph-lock';
import { recountFollowCounters } from '../users/recalculate-counters';

/** The Prisma client or a transaction opened by the service. */
export type BlocksDb = Prisma.TransactionClient;

/** The blocks of the viewer come after a keyset position, in the order (createdAt desc, blocked account id desc). */
function afterPosition(after: KeysetPosition | undefined): Prisma.BlockWhereInput {
  if (after === undefined) {
    return {};
  }

  return {
    OR: [
      { createdAt: { lt: after.createdAt } },
      { createdAt: after.createdAt, blockedId: { lt: after.id } },
    ],
  };
}

/** The only place that reads and writes the block rows and the follows they remove (section 6.3). */
@Injectable()
export class BlocksRepository {
  /** The account with this handle, whatever its status. Handles are unique regardless of case (DEC-061). */
  findAccountByHandle(db: BlocksDb, handle: string) {
    return db.user.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' } },
      select: { id: true, handle: true, status: true },
    });
  }

  /**
   * Locks the account rows, exclusively, until the transaction ends, one at a time in the order of their ids. The
   * follow counters of both rows change when a follow is removed, so the lock is exclusive (section 6.3).
   * Returns the status read under each lock.
   */
  async lockAccounts(db: BlocksDb, userIds: readonly string[]): Promise<Map<string, AccountStatus>> {
    await lockAccountGraphShared(db);
    const statuses = new Map<string, AccountStatus>();
    for (const userId of [...new Set(userIds)].sort()) {
      const rows = await db.$queryRaw<{ status: AccountStatus }[]>`
        SELECT status FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (rows[0] !== undefined) {
        statuses.set(userId, rows[0].status);
      }
    }

    return statuses;
  }

  /** Adds the block. True only when the row is new: a block that exists already is left as it is (idempotence). */
  async createBlock(db: BlocksDb, blockerId: string, blockedId: string): Promise<boolean> {
    const result = await db.block.createMany({ data: { blockerId, blockedId }, skipDuplicates: true });

    return result.count === 1;
  }

  deleteBlock(db: BlocksDb, blockerId: string, blockedId: string) {
    return db.block.deleteMany({ where: { blockerId, blockedId } });
  }

  /**
   * Removes the follows in both directions between the two accounts, and recounts the follow counters of both accounts
   * when a row was removed, counting only active accounts (R14, section 6.3).
   */
  async removeFollowsBetween(db: BlocksDb, firstId: string, secondId: string): Promise<void> {
    await this.removeFollow(db, firstId, secondId);
    await this.removeFollow(db, secondId, firstId);
  }

  private async removeFollow(db: BlocksDb, followerId: string, followeeId: string): Promise<void> {
    const removed = await db.follow.deleteMany({ where: { followerId, followeeId } });
    if (removed.count === 1) {
      await recountFollowCounters(db, [followerId, followeeId]);
    }
  }

  /** One page of the accounts the viewer blocks, the most recent block first. */
  findBlockPage(db: BlocksDb, blockerId: string, after: KeysetPosition | undefined, take: number) {
    return db.block.findMany({
      where: { AND: [{ blockerId }, afterPosition(after)] },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
      take,
      select: {
        createdAt: true,
        blockedId: true,
        blocked: { select: { handle: true, displayName: true } },
      },
    });
  }
}
