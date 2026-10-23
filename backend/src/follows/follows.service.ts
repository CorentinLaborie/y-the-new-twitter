import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { decodeKeysetCursor, encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import { PrismaService } from '../database/prisma.service';
import { ACCOUNT_NOT_ACTIVE_MESSAGE } from '../users/users.repository';
import { FollowListQueryDto } from './dto/follow-list-query.dto';
import { FollowListPageDto } from './dto/follow-list-page.dto';
import { FollowStateDto } from './dto/follow-state.dto';
import { FollowsDb, FollowsRepository, FollowListRow } from './follows.repository';

/** The 404 message of the follow routes: an unknown, inactive or blocked account (R13, R14). */
export const ACCOUNT_NOT_FOUND_MESSAGE = 'Compte introuvable.';
const SELF_FOLLOW_MESSAGE = 'Vous ne pouvez pas vous suivre vous-même.';

/** The page of a list: the rows read with one more than the limit, so the presence of a next page is known. */
function toListPage(rows: readonly FollowListRow[], limit: number): FollowListPageDto {
  const items = rows.slice(0, limit);
  const last = items.at(-1);

  return {
    items: items.map((row) => ({ handle: row.handle, displayName: row.displayName })),
    nextCursor:
      rows.length > limit && last !== undefined
        ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.accountId })
        : null,
  };
}

/**
 * Follows of a logged-in, active account (R13, R14, section 6.2). The follow and the notice to the followed account
 * are written in one transaction; a follow that exists already changes nothing (idempotence).
 */
@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly follows: FollowsRepository,
  ) {}

  /** The viewer follows the account. Following it again changes nothing and writes no second notice. */
  async follow(viewer: SessionUser, handle: string): Promise<FollowStateDto> {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.findTarget(tx, handle);
      if (target.id === viewer.id) {
        throw new UnprocessableEntityException(SELF_FOLLOW_MESSAGE);
      }
      await this.lockViewerAndTarget(tx, viewer.id, target.id);
      // Checked under the lock: a status change or a block made meanwhile is seen here (R13, R14).
      if (!(await this.follows.findVisibleAccount(tx, viewer.id, { id: target.id }))) {
        throw new NotFoundException(ACCOUNT_NOT_FOUND_MESSAGE);
      }
      if (await this.follows.createFollow(tx, viewer.id, target.id)) {
        await this.follows.changeFollowCounters(tx, viewer.id, target.id, 1);
        await this.follows.writeFollowNotification(tx, target.id, viewer.id);
      }

      return { handle: target.handle, viewerFollows: true };
    });
  }

  /** The viewer no longer follows the account. Nothing happens when they did not follow it, and the answer is the same when the account became inactive or blocked. */
  async unfollow(viewer: SessionUser, handle: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.findTarget(tx, handle);
      await this.lockViewerAndTarget(tx, viewer.id, target.id);
      const removed = await this.follows.deleteFollow(tx, viewer.id, target.id);
      if (removed.count === 1) {
        await this.follows.changeFollowCounters(tx, viewer.id, target.id, -1);
      }
    });
  }

  /** The accounts that follow the account, the most recent follow first (section 9.1). */
  async listFollowers(
    viewer: SessionUser,
    handle: string,
    query: FollowListQueryDto,
  ): Promise<FollowListPageDto> {
    const owner = await this.findVisibleOwner(viewer.id, handle);
    const rows = await this.follows.findFollowerPage(this.prisma, {
      ownerId: owner.id,
      viewerId: viewer.id,
      after: this.decodeCursor(query.cursor),
      take: query.limit + 1,
    });

    return toListPage(rows, query.limit);
  }

  /** The accounts that the account follows, the most recent follow first (section 9.1). */
  async listFollowing(
    viewer: SessionUser,
    handle: string,
    query: FollowListQueryDto,
  ): Promise<FollowListPageDto> {
    const owner = await this.findVisibleOwner(viewer.id, handle);
    const rows = await this.follows.findFollowingPage(this.prisma, {
      ownerId: owner.id,
      viewerId: viewer.id,
      after: this.decodeCursor(query.cursor),
      take: query.limit + 1,
    });

    return toListPage(rows, query.limit);
  }

  private decodeCursor(cursor: string | undefined) {
    return cursor === undefined ? undefined : decodeKeysetCursor(cursor);
  }

  /** The account of the handle, whatever its status. Unknown handles are not found. */
  private async findTarget(db: FollowsDb, handle: string): Promise<{ id: string; handle: string }> {
    const target = await this.follows.findAccountByHandle(db, handle);
    if (target === null) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MESSAGE);
    }

    return target;
  }

  /** The account whose list is read: it must be visible to the viewer (R13, R14). */
  private async findVisibleOwner(viewerId: string, handle: string): Promise<{ id: string; handle: string }> {
    const owner = await this.follows.findVisibleAccount(this.prisma, viewerId, {
      handle: { equals: handle, mode: 'insensitive' },
    });
    if (owner === null) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND_MESSAGE);
    }

    return owner;
  }

  /**
   * Locks the viewer and the target, in the order of their ids (section 6.3), then refuses a viewer whose account is
   * not active any more (R13). The lock keeps a status change from landing between the check and the write.
   */
  private async lockViewerAndTarget(db: FollowsDb, viewerId: string, targetId: string): Promise<void> {
    const statuses = await this.follows.lockAccounts(db, [viewerId, targetId]);
    if (statuses.get(viewerId) !== 'active') {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
  }
}
