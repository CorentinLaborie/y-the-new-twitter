import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../database/generated/client/client';

/** The Prisma client or a transaction opened by the service. */
export type Db = Prisma.TransactionClient;

interface NewSignupCode {
  userId: string;
  codeHash: string;
  expiresAt: Date;
}

/** The only file of the signup flow that queries the `signup_codes` table. */
@Injectable()
export class SignupCodesRepository {
  create(db: Db, code: NewSignupCode) {
    return db.signupCode.create({ data: code });
  }

  /** The newest code still usable: not consumed, not expired. */
  findOpen(db: Db, userId: string, now: Date) {
    return db.signupCode.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Reserves one attempt before the code is checked, in one write: concurrent requests cannot all pass the limit
   * (DEC-137). False when the attempts are used up, or the code was used or expired in the meantime.
   */
  async reserveAttempt(db: Db, id: string, maxAttempts: number, now: Date): Promise<boolean> {
    const result = await db.signupCode.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });

    return result.count === 1;
  }

  /** Marks the code used. Returns false when another request used it first (single use). */
  async consume(db: Db, id: string, now: Date): Promise<boolean> {
    const result = await db.signupCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: now },
    });

    return result.count === 1;
  }

  /** Invalidates every code of the account that is not used yet (resend, DEC-137). */
  invalidateOpen(db: Db, userId: string, now: Date) {
    return db.signupCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
  }
}
