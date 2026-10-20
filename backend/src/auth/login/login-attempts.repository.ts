import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { LoginResult } from '../../database/generated/client/client';

interface NewLoginEvent {
  /** Null when the e-mail address matches no account. */
  userId: string | null;
  result: LoginResult;
  ipHash: string;
  userAgent: string | null;
}

/**
 * The only writes of the login flow: the account counters (users.failed_login_count, users.locked_until)
 * and login_events (DEC-060). The rules (thresholds, lock duration) live in LoginService.
 */
@Injectable()
export class LoginAttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(event: NewLoginEvent): Promise<void> {
    await this.prisma.loginEvent.create({ data: event });
  }

  /** Counts one failure on the account (users.failed_login_count, DEC-040). */
  async countFailure(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });
  }

  /** Failures recorded since `since` (login_events carries the time of each attempt, DEC-143). */
  countFailuresSince(userId: string, since: Date): Promise<number> {
    return this.prisma.loginEvent.count({
      where: { userId, result: 'failure', createdAt: { gte: since } },
    });
  }

  /** Time of the account's last successful login, or null when it never logged in. */
  async lastSuccessAt(userId: string): Promise<Date | null> {
    const event = await this.prisma.loginEvent.findFirst({
      where: { userId, result: 'success' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return event?.createdAt ?? null;
  }

  async lockUntil(userId: string, lockedUntil: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil } });
  }

  /**
   * Resets the counter after a success. The update only happens while the account is not locked,
   * so a concurrent failure that locks it in the meantime is not overridden. Returns false in that case.
   */
  async clearAfterSuccess(userId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    return result.count === 1;
  }
}
