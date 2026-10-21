import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/session/access.decorators';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { Admin } from '../admin.decorators';
import { AccountStatusDto } from './account-status.dto';
import { AccountListQueryDto } from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';
import type { AccountPage, AccountView, StatusChangeResult } from './admin-users.types';

/** The account search, the account view and the status changes of the back-office (section 3.3). Not in the public OpenAPI. */
@ApiExcludeController()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** One page of accounts, matched by handle or e-mail address, optionally of one status. */
  @Admin()
  @Get()
  list(@Query() query: AccountListQueryDto): Promise<AccountPage> {
    return this.users.list({ q: query.q, status: query.status, cursor: query.cursor, limit: query.limit });
  }

  /** One account: its details, its activity and its recent audit entries. */
  @Admin()
  @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<AccountView> {
    return this.users.view(id);
  }

  /** Suspends an account, or lifts a suspension, with a reason. Needs a re-authentication of the last 10 minutes (DEC-088). */
  @Admin({ reauth: true })
  @Put(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AccountStatusDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<StatusChangeResult> {
    return this.users.changeStatus(admin.id, id, { status: body.status, reason: body.reason }, new Date());
  }
}
