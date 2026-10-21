/**
 * The indicators of the dashboard (section 3.1). Times are ISO strings. The handling time is the mean, in seconds, between
 * the opening and the decision of the reports decided in the last 30 days; null when none was decided in that time.
 */
export interface DashboardView {
  openReportCount: number;
  oldestOpenReportAt: string | null;
  averageHandlingSeconds: number | null;
  pendingDeletionCount: number;
  nextPurgeAt: string | null;
}
