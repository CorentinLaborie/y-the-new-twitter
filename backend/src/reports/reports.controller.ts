import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportResponseDto } from './dto/report-response.dto';
import { ReportsService } from './reports.service';

/** Reports on questions and replies (plan L6, S1). Logged-in, active accounts only (R13). */
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Repeated with the same report, returns the first one. Section 9.1.',
  })
  @ApiCreatedResponse({
    description: 'The report, open.',
    type: ReportResponseDto,
    headers: { Location: { description: 'Path of the new report.', schema: { type: 'string' } } },
  })
  @problemDetailsResponse(
    400,
    'Not exactly one of questionId and replyId, a UUID is invalid, the reason is not in the list, or the body is invalid.',
  )
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'The content does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(
    422,
    'The reason is other and the details are missing, the details are longer than 280 characters, the reported content is the viewer’s own, or the key was used for another request.',
  )
  async create(
    @CurrentUser() reporter: SessionUser,
    @Body() body: CreateReportDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReportResponseDto> {
    const report = await this.reports.create(reporter, body, idempotencyKey);
    response.setHeader('Location', `/api/v1/reports/${report.id}`);

    return report;
  }
}
