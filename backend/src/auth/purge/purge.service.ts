import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CLOCK, type Clock } from './clock';
import { MaintenancePrismaService } from './maintenance-prisma.service';

/** Codes are deleted 24 hours after they expire (section 13, DEC-068). */
const CODE_RETENTION_MS = 24 * 60 * 60 * 1000;

export const PURGE_JOB_NAME = 'retention-purge';

export interface PurgeReport {
  signupCodes: number;
  passwordResetCodes: number;
  emailChangeCodes: number;
  sessions: number;
}

/** Daily retention job (DEC-068): expired codes and expired sessions. */
@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly database: MaintenancePrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Deletes the codes that expired more than 24 hours ago, and the sessions whose expiry is in the past.
   * Each table is purged on its own, in this order.
   */
  async purgeExpired(): Promise<PurgeReport> {
    const now = this.clock.now();
    const codeCutoff = new Date(now.getTime() - CODE_RETENTION_MS);

    const signupCodes = await this.database.signupCode.deleteMany({ where: { expiresAt: { lt: codeCutoff } } });
    const passwordResetCodes = await this.database.passwordResetCode.deleteMany({
      where: { expiresAt: { lt: codeCutoff } },
    });
    const emailChangeCodes = await this.database.emailChangeCode.deleteMany({
      where: { expiresAt: { lt: codeCutoff } },
    });
    const sessions = await this.database.session.deleteMany({ where: { expiresAt: { lt: now } } });

    return {
      signupCodes: signupCodes.count,
      passwordResetCodes: passwordResetCodes.count,
      emailChangeCodes: emailChangeCodes.count,
      sessions: sessions.count,
    };
  }

  /** Runs every day at 03:00 Paris time. A failure is logged and retried the next day, never thrown. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: PURGE_JOB_NAME, timeZone: 'Europe/Paris' })
  async runDailyPurge(): Promise<void> {
    try {
      const report = await this.purgeExpired();
      this.logger.log(`Retention purge done: ${JSON.stringify(report)}`);
    } catch (error) {
      this.logger.error('Retention purge failed; it runs again tomorrow.', error instanceof Error ? error.stack : undefined);
    }
  }
}
