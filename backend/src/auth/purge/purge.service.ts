import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CLOCK, type Clock } from './clock';
import { MaintenancePrismaService } from './maintenance-prisma.service';

/** Codes are deleted 24 hours after they expire (section 13, DEC-068). */
const CODE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Deleted questions and replies keep their text and links for 90 days (section 13, DEC-067). */
const CONTENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const PURGE_JOB_NAME = 'retention-purge';

export interface PurgeReport {
  signupCodes: number;
  passwordResetCodes: number;
  emailChangeCodes: number;
  sessions: number;
  idempotencyKeys: number;
  erasedQuestions: number;
  erasedReplies: number;
}

/** Daily retention job (DEC-068): expired codes, sessions and idempotency keys, and erased deleted content. */
@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly database: MaintenancePrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Deletes the codes that expired more than 24 hours ago, the sessions and the idempotency keys whose expiry is in the past,
   * then erases the content deleted more than 90 days ago. Each step runs on its own, in this order.
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
    const idempotencyKeys = await this.database.idempotencyKey.deleteMany({ where: { expiresAt: { lte: now } } });
    const erased = await this.eraseDeletedContent(now);

    return {
      signupCodes: signupCodes.count,
      passwordResetCodes: passwordResetCodes.count,
      emailChangeCodes: emailChangeCodes.count,
      sessions: sessions.count,
      idempotencyKeys: idempotencyKeys.count,
      erasedQuestions: erased.questions,
      erasedReplies: erased.replies,
    };
  }

  /**
   * Erases the text and links of the questions and replies deleted more than 90 days ago: their hashtag links
   * and mentions are removed, and the body is emptied. The row stays, as a placeholder for replies (DEC-067).
   * Rows already erased are not selected again.
   */
  private async eraseDeletedContent(now: Date): Promise<{ questions: number; replies: number }> {
    const cutoff = new Date(now.getTime() - CONTENT_RETENTION_MS);
    const questions = (
      await this.database.question.findMany({ where: { deletedAt: { lt: cutoff }, body: { not: '' } }, select: { id: true } })
    ).map((row) => row.id);
    const replies = (
      await this.database.reply.findMany({ where: { deletedAt: { lt: cutoff }, body: { not: '' } }, select: { id: true } })
    ).map((row) => row.id);

    await this.database.$transaction([
      this.database.questionHashtag.deleteMany({ where: { questionId: { in: questions } } }),
      this.database.mention.deleteMany({ where: { OR: [{ questionId: { in: questions } }, { replyId: { in: replies } }] } }),
      this.database.question.updateMany({ where: { id: { in: questions } }, data: { body: '' } }),
      this.database.reply.updateMany({ where: { id: { in: replies } }, data: { body: '' } }),
    ]);

    return { questions: questions.length, replies: replies.length };
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
