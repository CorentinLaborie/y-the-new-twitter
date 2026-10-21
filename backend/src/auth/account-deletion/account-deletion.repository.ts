import { Injectable } from '@nestjs/common';
import type { AccountStatus } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import { recalculateCounters } from '../../users/recalculate-counters';

interface DeletionAccount {
  passwordHash: string;
  status: AccountStatus;
}

/** The writes of a deletion request: the account row, its counters and its sessions (R16). */
@Injectable()
export class AccountDeletionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAccount(userId: string): Promise<DeletionAccount | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, status: true },
    });
  }

  /**
   * Moves an active account to pending_deletion, recalculates the counters that the account no longer adds to, and
   * closes every session of the account, in one transaction. False when the account is not active any more.
   */
  startDeletion(userId: string, now: Date, purgeAt: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, status: 'active' },
        data: {
          status: 'pending_deletion',
          statusChangedAt: now,
          deletionRequestedAt: now,
          deletionPurgeAt: purgeAt,
        },
      });
      if (result.count !== 1) {
        return false;
      }

      await recalculateCounters(tx, userId);
      await tx.session.deleteMany({ where: { userId } });
      return true;
    });
  }
}
