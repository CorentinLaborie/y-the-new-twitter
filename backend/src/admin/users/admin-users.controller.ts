import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Admin } from '../admin.decorators';
import { AccountListQueryDto } from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';
import type { AccountPage, AccountView } from './admin-users.types';

/** The account search and the account view of the back-office, read-only (section 3.3). Not in the public OpenAPI. */
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
}
