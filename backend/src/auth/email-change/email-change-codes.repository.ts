import { Injectable } from '@nestjs/common';
import { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import { CODE_MAX_ATTEMPTS } from '../verification-code';

interface OpenEmailChangeCode {
  id: string;
  codeHash: string;
  newEmail: string;
}

interface ChangeAccount {
  email: string;
  status: string;
  passwordHash: string;
}

type EmailChangeOutcome = 'changed' | 'code-used' | 'taken';

/**
 * The only file of the e-mail change that queries the database (section 8.2). It owns the
 * `email_change_codes` table, and the user row whose address changes. UsersRepository has no
 * lookup by id and no e-mail update, so both live here; the update shares a transaction with the
 * consumption of the code.
 */
@Injectable()
export class EmailChangeCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The account, for the status check and for the address that is told about the change. */
  findAccount(userId: string): Promise<ChangeAccount | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true, passwordHash: true },
    });
  }

  /** Consumes the open codes of the user, then stores the new one for the new address. */
  async replaceOpenCode(userId: string, newEmail: string, codeHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailChangeCode.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailChangeCode.create({ data: { userId, newEmail, codeHash, expiresAt } }),
    ]);
  }

  /** The newest code of the user that is neither used nor expired. */
  findOpenCode(userId: string): Promise<OpenEmailChangeCode | null> {
    return this.prisma.emailChangeCode.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, newEmail: true },
    });
  }

  /**
   * Counts one attempt on the code, in a single statement, so parallel guesses cannot go past
   * CODE_MAX_ATTEMPTS. False when the code is used, expired or out of attempts.
   */
  async reserveAttempt(codeId: string): Promise<boolean> {
    const result = await this.prisma.emailChangeCode.updateMany({
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
   * Consumes the code and switches the address, in one transaction. 'taken' when another account
   * got the address after the request (unique column); 'code-used' when the code was consumed first.
   */
  async completeChange(codeId: string, userId: string, newEmail: string): Promise<EmailChangeOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.emailChangeCode.updateMany({
          where: { id: codeId, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) {
          return 'code-used';
        }

        await tx.user.update({ where: { id: userId }, data: { email: newEmail.toLowerCase() } });
        return 'changed';
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'taken';
      }
      throw error;
    }
  }
}
