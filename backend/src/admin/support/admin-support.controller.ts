import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/session/access.decorators';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { Admin } from '../admin.decorators';
import { SupportListQueryDto, SupportReplyDto } from './admin-support.dto';
import { AdminSupportService } from './admin-support.service';
import type { SupportThreadDetailView, SupportThreadPage } from './admin-support.types';

/** The contact threads of the back-office: the list, one thread, its answers and its closing (section 3.4). Not in the public OpenAPI. */
@ApiExcludeController()
@Controller('admin/support-threads')
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  /** One page of threads, newest first, optionally only the open or the closed ones. */
  @Admin()
  @Get()
  list(@Query() query: SupportListQueryDto): Promise<SupportThreadPage> {
    return this.support.list({ status: query.status, cursor: query.cursor, limit: query.limit });
  }

  /** One thread with all its messages. */
  @Admin()
  @Get(':id')
  view(@Param('id', ParseUUIDPipe) id: string): Promise<SupportThreadDetailView> {
    return this.support.view(id);
  }

  /** Sends an answer to the account by e-mail. A closed thread answers 409. */
  @Admin()
  @Post(':id/messages')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportReplyDto,
    @CurrentUser() admin: SessionUser,
  ): Promise<SupportThreadDetailView> {
    return this.support.reply(admin.id, id, body.text, new Date());
  }

  /**
   * Closes an open thread without sending anything. Needs a re-authentication of the last 10 minutes (DEC-088).
   * A closed thread answers 409.
   */
  @Admin({ reauth: true })
  @Put(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: SessionUser,
  ): Promise<SupportThreadDetailView> {
    return this.support.close(admin.id, id, new Date());
  }
}
