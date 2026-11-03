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
import { BlocksDb, BlocksRepository } from './blocks.repository';
import type { BlockPageDto } from './dto/block-page.dto';
import type { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';

/** The 404 message of the block routes: an unknown or inactive account (plan L6, 5.2). */
export const BLOCK_TARGET_NOT_FOUND = 'Compte introuvable.';
const SELF_BLOCK_MESSAGE = 'Vous ne pouvez pas vous bloquer.';

/**
 * Blocks of a logged-in, active account (plan L6, S2). A block and the removal of the follows in both directions are
 * written in one transaction. Blocking twice changes nothing (idempotence). The blocked account is never told.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksRepository,
  ) {}

  /** The viewer blocks the account (PUT). Unknown and inactive accounts are not found, and no one is told. */
  async block(viewer: SessionUser, handle: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.findTarget(tx, handle);
      if (target.id === viewer.id) {
        throw new UnprocessableEntityException(SELF_BLOCK_MESSAGE);
      }
      const statuses = await this.blocks.lockAccounts(tx, [viewer.id, target.id]);
      if (statuses.get(viewer.id) !== 'active') {
        throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
      }
      // Checked under the lock: an account made inactive meanwhile is not found (R13).
      if (statuses.get(target.id) !== 'active') {
        throw new NotFoundException(BLOCK_TARGET_NOT_FOUND);
      }
      if (await this.blocks.createBlock(tx, viewer.id, target.id)) {
        await this.blocks.removeFollowsBetween(tx, viewer.id, target.id);
      }
    });
  }

  /**
   * The viewer lifts the block (DELETE). An unknown handle, or an account that was not blocked, changes nothing and
   * the answer is the same.
   */
  async unblock(viewer: SessionUser, handle: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockViewer(tx, viewer.id);
      const target = await this.blocks.findAccountByHandle(tx, handle);
      if (target !== null) {
        await this.blocks.deleteBlock(tx, viewer.id, target.id);
      }
    });
  }

  /** The accounts the viewer blocks, the most recent block first (section 9.1). */
  async list(viewer: SessionUser, query: FollowListQueryDto): Promise<BlockPageDto> {
    const after = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor);
    const rows = await this.blocks.findBlockPage(this.prisma, viewer.id, after, query.limit + 1);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);

    return {
      items: items.map((row) => ({
        handle: row.blocked.handle,
        displayName: row.blocked.displayName,
        avatarUrl: row.blocked.avatarUrl,
        blockedAt: row.createdAt,
      })),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.blockedId })
          : null,
    };
  }

  /** The account of the handle, when it is active. Unknown and inactive accounts are both not found. */
  private async findTarget(db: BlocksDb, handle: string): Promise<{ id: string }> {
    const target = await this.blocks.findAccountByHandle(db, handle);
    if (target === null || target.status !== 'active') {
      throw new NotFoundException(BLOCK_TARGET_NOT_FOUND);
    }

    return { id: target.id };
  }

  /** Locks the viewer, then refuses a viewer whose account is not active any more (R13). */
  private async lockViewer(db: BlocksDb, viewerId: string): Promise<void> {
    const statuses = await this.blocks.lockAccounts(db, [viewerId]);
    if (statuses.get(viewerId) !== 'active') {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
  }
}
