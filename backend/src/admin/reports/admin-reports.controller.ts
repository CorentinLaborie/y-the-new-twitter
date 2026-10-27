import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/session/access.decorators';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { Admin } from '../admin.decorators';
import { ReportDecisionDto, ReportListQueryDto, ReportRestoreDto } from './admin-reports.dto';
import { AdminReportsService } from './admin-reports.service';
import type {
  ReportDecisionResult,
  ReportDetailView,
  ReportPage,
  ReportRestoreResult,
} from './admin-reports.types';

/** The reports of the back-office: the list, one report, and the decision on it (section 3.5). Not in the public OpenAPI. */
@ApiExcludeController()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  /** One page of reports, newest first, optionally only the open or the decided ones, or of one reason. */
  @Admin()
  @Get()
  list(@Query() query: ReportListQueryDto): Promise<ReportPage> {
    return this.reports.list({
      status: query.status,
      reason: query.reason,
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  /** One report, with the reported content, its author's handle and the reports made on that content. */
  @Admin()
  @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<ReportDetailView> {
    return this.reports.view(id);
  }

  /**
   * Makes hidden content visible again (L7). Needs a re-authentication of the last 10 minutes (DEC-088). Answers 409
   * when the report did not hide the content, or when it is no longer hidden.
   */
  @Admin({ reauth: true })
  @Put(':id/restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportRestoreDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<ReportRestoreResult> {
    return this.reports.restore(admin.id, id, { note: body.note }, new Date());
  }

  /**
   * Hides the reported content or dismisses the report. Needs a re-authentication of the last 10 minutes (DEC-088).
   * A report already decided answers 409.
   */
  @Admin({ reauth: true })
  @Put(':id/decision')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReportDecisionDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<ReportDecisionResult> {
    return this.reports.decide(admin.id, id, { decision: body.decision, note: body.note }, new Date());
  }
}
