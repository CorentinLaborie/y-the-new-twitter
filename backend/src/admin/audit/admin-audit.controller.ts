import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Admin } from '../admin.decorators';
import { AuditListQueryDto } from './admin-audit.dto';
import { AuditLogService } from './audit-log.service';
import type { AuditPage, AuditVerification } from './audit-log.types';

/** The back-office audit log, read-only (DEC-059, DEC-063). Not in the public OpenAPI contract (DEC-037). */
@ApiExcludeController()
@Controller('admin/audit-log')
export class AdminAuditController {
  constructor(private readonly audit: AuditLogService) {}

  /** One page of the audit log, newest entry first. nextCursor is null on the last page. */
  @Admin()
  @Get()
  list(@Query() query: AuditListQueryDto): Promise<AuditPage> {
    return this.audit.list({ cursor: query.cursor, limit: query.limit, action: query.action });
  }

  /** Checks the whole chain from the oldest kept entry, and tells where it breaks if it does. */
  @Admin()
  @Get('verify')
  verify(): Promise<AuditVerification> {
    return this.audit.verify();
  }
}
