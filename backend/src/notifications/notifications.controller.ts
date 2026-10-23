import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { AllowStatuses, CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { NotificationPageDto, UnreadCountDto } from './dto/notification-page.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { ReadAllDto } from './dto/read-all.dto';
import { decodeCursor, NotificationsService } from './notifications.service';

const DEFAULT_LIMIT = 20;

/** Notifications of the signed-in viewer (L2). Suspended accounts read an empty list; the SessionGuard checks the rest (R13). */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @AllowStatuses('active', 'suspended')
  @ApiOkResponse({ description: 'One page of notifications.', type: NotificationPageDto })
  @problemDetailsResponse(400, 'Unknown tab, invalid limit or invalid cursor.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is neither active nor suspended.')
  @problemDetailsResponse(429, 'Too many requests.')
  list(
    @CurrentUser() viewer: SessionUser,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationPageDto> {
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (query.cursor !== undefined && cursor === undefined) {
      throw new BadRequestException('Curseur invalide.');
    }

    return this.notifications.list(viewer, query.limit ?? DEFAULT_LIMIT, query.type, cursor);
  }

  @Get('unread-count')
  @AllowStatuses('active', 'suspended')
  @ApiOkResponse({ description: 'Number of unread lines.', type: UnreadCountDto })
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is neither active nor suspended.')
  @problemDetailsResponse(429, 'Too many requests.')
  async unreadCount(@CurrentUser() viewer: SessionUser): Promise<UnreadCountDto> {
    return { unread: await this.notifications.unreadCount(viewer) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Every unread line of the viewer is now read.' })
  @problemDetailsResponse(400, 'The ids list is not a list of at most 100 UUIDs.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended accounts included), or the CSRF token is missing.')
  @problemDetailsResponse(429, 'Too many requests.')
  async markAllRead(@CurrentUser() viewer: SessionUser, @Body() body: ReadAllDto): Promise<void> {
    await this.notifications.markAllRead(viewer, body.ids);
  }
}
