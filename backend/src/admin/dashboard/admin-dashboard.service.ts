import { Injectable } from '@nestjs/common';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import type { DashboardView } from './admin-dashboard.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The window of the handling time: the reports decided in the last 30 days. */
const HANDLING_WINDOW_DAYS = 30;

/** The indicators of the back-office dashboard (section 3.1). The dates are ISO (UTC), as the back-office shows them. */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly repository: AdminDashboardRepository) {}

  async view(now: Date): Promise<DashboardView> {
    const [openReportCount, oldestOpen, averageSeconds, pendingDeletionCount, nextPurge] = await Promise.all([
      this.repository.openReportCount(),
      this.repository.oldestOpenReportAt(),
      this.repository.averageHandlingSeconds(new Date(now.getTime() - HANDLING_WINDOW_DAYS * DAY_MS)),
      this.repository.pendingDeletionCount(),
      this.repository.nextPurgeAt(),
    ]);

    return {
      openReportCount,
      oldestOpenReportAt: oldestOpen?.toISOString() ?? null,
      averageHandlingSeconds: averageSeconds === null ? null : Math.round(averageSeconds),
      pendingDeletionCount,
      nextPurgeAt: nextPurge?.toISOString() ?? null,
    };
  }
}
