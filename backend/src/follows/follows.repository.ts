import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../database/generated/client/client';
import type { KeysetPosition } from '../common/pagination/keyset-cursor';
import { visibleAccountTo } from '../users/account-visibility';

/** The Prisma client or a transaction opened by the service. */
export type FollowsDb = Prisma.TransactionClient;

/** An account as a list shows it, with the position of its follow (the list is ordered by it, then by id). */
export interface FollowListRow {
  readonly createdAt: Date;
  readonly accountId: string;
  readonly handle: string;
  readonly displayName: string;
}

export interface FollowPageQuery {
  /** The account whose list is read: the followee of a follower list, the follower of a following list. */
  readonly ownerId: string;
  readonly viewerId: string;
  /** The last row of the previous page, or undefined for the first page. */
  readonly after: KeysetPosition | undefined;
  readonly take: number;
}

/**
 * An account a list may show: visible to the viewer, and not blocked in either direction with the owner of the list
 * either (R14). A follow between two accounts that block each other is not listed.
 */
function listedAccount(ownerId: string, viewerId: string): Prisma.UserWhereInput {
  return { AND: [visibleAccountTo(viewerId), visibleAccountTo(ownerId)] };
}

/** The rows after a keyset position, in the order (createdAt desc, account id desc). */
function afterPosition(
  after: KeysetPosition | undefined,
  accountField: 'followerId' | 'followeeId',
): Prisma.FollowWhereInput {
  if (after === undefined) {
    return {};
  }
  const idBefore =
    accountField === 'followerId' ? { followerId: { lt: after.id } } : { followeeId: { lt: after.id } };

  return { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, ...idBefore }] };
}

/** The only place that reads and writes the follow rows (section 6.3). */
@Injectable()
export class FollowsRepository {
  /** The account with this handle, whatever its status. Handles are unique regardless of case (DEC-061). */
  findAccountByHandle(db: FollowsDb, handle: string) {
    return db.user.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' } },
      select: { id: true, handle: true },
    });
  }

  /** The account matching `where`, when the viewer may see it (visibleAccountTo). Null when it is not visible. */
  findVisibleAccount(db: FollowsDb, viewerId: string, where: Prisma.UserWhereInput) {
    return db.user.findFirst({
      where: { AND: [where, visibleAccountTo(viewerId)] },
      select: { id: true, handle: true },
    });
  }

  /**
   * Locks the account rows, exclusively, until the transaction ends, one at a time in the order of their ids. The lock
   * is exclusive because the follow counters of both rows change (section 6.3). Two follows that cross each other lock
   * the same rows in the same order, so they never wait on each other.
   * Returns the status read under each lock.
   */
  async lockAccounts(db: FollowsDb, userIds: readonly string[]): Promise<Map<string, AccountStatus>> {
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

  /** Adds the follow. True only when the row is new: a row that exists already is left as it is (idempotence). */
  async createFollow(db: FollowsDb, followerId: string, followeeId: string): Promise<boolean> {
    const result = await db.follow.createMany({ data: { followerId, followeeId }, skipDuplicates: true });

    return result.count === 1;
  }

  /** The notice to the followed account about a new follow (type follow, no question, shown in L2). */
  writeFollowNotification(db: FollowsDb, recipientId: string, actorId: string) {
    return db.notification.create({ data: { recipientId, actorId, type: 'follow' } });
  }

  deleteFollow(db: FollowsDb, followerId: string, followeeId: string) {
    return db.follow.deleteMany({ where: { followerId, followeeId } });
  }

  /** Moves the follow counters of both accounts by `delta` (+1 on a new follow, -1 on an unfollow), in the same transaction. */
  async changeFollowCounters(
    db: FollowsDb,
    followerId: string,
    followeeId: string,
    delta: number,
  ): Promise<void> {
    await db.user.update({ where: { id: followerId }, data: { followingCount: { increment: delta } } });
    await db.user.update({ where: { id: followeeId }, data: { followerCount: { increment: delta } } });
  }

  /** One page of the accounts that follow `ownerId`, the most recent follow first. Hidden or blocked accounts are left out. */
  /** The accounts among `accountIds` that the viewer follows. */
  async findFollowedIds(
    db: FollowsDb,
    viewerId: string,
    accountIds: readonly string[],
  ): Promise<Set<string>> {
    const rows = await db.follow.findMany({
      where: { followerId: viewerId, followeeId: { in: [...accountIds] } },
      select: { followeeId: true },
    });

    return new Set(rows.map((row) => row.followeeId));
  }

  async findFollowerPage(db: FollowsDb, query: FollowPageQuery): Promise<FollowListRow[]> {
    const rows = await db.follow.findMany({
      where: {
        AND: [
          { followeeId: query.ownerId },
          { follower: listedAccount(query.ownerId, query.viewerId) },
          afterPosition(query.after, 'followerId'),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
      take: query.take,
      select: {
        createdAt: true,
        followerId: true,
        follower: { select: { handle: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      createdAt: row.createdAt,
      accountId: row.followerId,
      handle: row.follower.handle,
      displayName: row.follower.displayName,
    }));
  }

  /** One page of the accounts that `ownerId` follows, the most recent follow first. Hidden or blocked accounts are left out. */
  async findFollowingPage(db: FollowsDb, query: FollowPageQuery): Promise<FollowListRow[]> {
    const rows = await db.follow.findMany({
      where: {
        AND: [
          { followerId: query.ownerId },
          { followee: listedAccount(query.ownerId, query.viewerId) },
          afterPosition(query.after, 'followeeId'),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { followeeId: 'desc' }],
      take: query.take,
      select: {
        createdAt: true,
        followeeId: true,
        followee: { select: { handle: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      createdAt: row.createdAt,
      accountId: row.followeeId,
      handle: row.followee.handle,
      displayName: row.followee.displayName,
    }));
  }
}
