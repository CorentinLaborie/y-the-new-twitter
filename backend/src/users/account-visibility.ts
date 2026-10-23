import type { Prisma } from '../database/generated/client/client';

/**
 * What one viewer may see of an account: active, and no block in either direction (R13, R14). Questions, follows and
 * their lists read accounts through this filter, so a blocked viewer gets the same answer everywhere.
 */
export function visibleAccountTo(viewerId: string): Prisma.UserWhereInput {
  return {
    status: 'active',
    blocks: { none: { blockedId: viewerId } },
    blockedBy: { none: { blockerId: viewerId } },
  };
}
