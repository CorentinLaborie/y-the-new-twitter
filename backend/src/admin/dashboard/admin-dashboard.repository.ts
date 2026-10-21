import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * The counts and dates of the dashboard. It only reads: the figures are counted when the request is made, so they are
 * never older than the request.
 */
@Injectable()
export class AdminDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  openReportCount(): Promise<number> {
    return this.prisma.report.count({ where: { status: 'open' } });
  }

  /** The creation time of the oldest open report, or null when no report is open. */
  async oldestOpenReportAt(): Promise<Date | null> {
    const report = await this.prisma.report.findFirst({
      where: { status: 'open' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    });
    return report?.createdAt ?? null;
  }

  /**
   * The mean time, in seconds, from the opening to the decision of the reports decided at or after `since`. Null when
   * none was decided in that time.
   */
  async averageHandlingSeconds(since: Date): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ seconds: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)))::float8 AS seconds
      FROM reports
      WHERE status <> 'open' AND reviewed_at IS NOT NULL AND reviewed_at >= ${since}`;
    return rows[0]?.seconds ?? null;
  }

  pendingDeletionCount(): Promise<number> {
    return this.prisma.user.count({ where: { status: 'pending_deletion' } });
  }

  /** The earliest purge date of the accounts pending deletion, or null when none is pending. */
  async nextPurgeAt(): Promise<Date | null> {
    const account = await this.prisma.user.findFirst({
      where: { status: 'pending_deletion', deletionPurgeAt: { not: null } },
      orderBy: [{ deletionPurgeAt: 'asc' }, { id: 'asc' }],
      select: { deletionPurgeAt: true },
    });
    return account?.deletionPurgeAt ?? null;
  }
}
