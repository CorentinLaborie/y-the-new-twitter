import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** The Prisma client or a transaction opened by the service. */
export type PasswordChangeDb = Prisma.TransactionClient;

/** The only place that reads and writes the password and the sessions of a password change (section 6.3). */
@Injectable()
export class PasswordChangeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The stored hash, the e-mail (for the notice) and the status of the account. */
  findCredentials(db: PasswordChangeDb, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true, status: true },
    });
  }

  /**
   * Replaces the hash, and closes every session of the account except the current one (decision 1). Both writes
   * are in the caller's transaction.
   */
  async replacePassword(
    db: PasswordChangeDb,
    userId: string,
    passwordHash: string,
    keepSessionId: string,
  ): Promise<void> {
    await db.user.update({ where: { id: userId }, data: { passwordHash } });
    await db.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
  }

  /** Locks the account row until the transaction ends: the status is read again under the lock (R13). */
  async lockAccount(db: PasswordChangeDb, userId: string): Promise<AccountStatus | undefined> {
    const rows = await db.$queryRaw<{ status: AccountStatus }[]>`
      SELECT status FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

    return rows[0]?.status;
  }

  /** The transaction handle of the service. */
  transaction<T>(write: (db: PasswordChangeDb) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(write);
  }
}
