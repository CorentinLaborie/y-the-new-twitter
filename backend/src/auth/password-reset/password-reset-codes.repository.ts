import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CODE_MAX_ATTEMPTS } from '../verification-code';

export interface OpenPasswordResetCode {
  id: string;
  codeHash: string;
}

/**
 * The only file of the password reset that queries the database (section 8.2). It owns the
 * `password_reset_codes` table, and the two writes that end a reset: the new password hash and the
 * closing of every session of the user. The user row is written here because UsersRepository has no
 * password method; both writes share one transaction.
 */
@Injectable()
export class PasswordResetCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Consumes the open codes of the user, then stores the new one. Only one code is usable at a time. */
  async replaceOpenCode(userId: string, codeHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetCode.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordResetCode.create({ data: { userId, codeHash, expiresAt } }),
    ]);
  }

  /** The newest code of the user that is neither used nor expired. */
  findOpenCode(userId: string): Promise<OpenPasswordResetCode | null> {
    return this.prisma.passwordResetCode.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });
  }

  /**
   * Counts one attempt on the code, in a single statement, so parallel guesses cannot go past
   * CODE_MAX_ATTEMPTS. False when the code is used, expired or out of attempts.
   */
  async reserveAttempt(codeId: string): Promise<boolean> {
    const result = await this.prisma.passwordResetCode.updateMany({
      where: {
        id: codeId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: CODE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });

    return result.count === 1;
  }

  /**
   * Consumes the code, stores the new password hash and closes every session of the user, in one
   * transaction. False when another request consumed the code first; nothing is written then.
   */
  completeReset(codeId: string, userId: string, passwordHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetCode.updateMany({
        where: { id: codeId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId } });
      return true;
    });
  }
}
