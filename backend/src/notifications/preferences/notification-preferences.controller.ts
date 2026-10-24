import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/session/access.decorators';
import type { SessionUser } from '../../auth/session/session-user.repository';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import {
  NotificationPreferenceDto,
  NotificationPreferencesDto,
  SetNotificationPreferenceDto,
} from './dto/notification-preference.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

/** Notification preferences (plan L5, step 8). Only an active account reaches them (R13). */
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @ApiOkResponse({ description: 'The stored preferences of the viewer.', type: NotificationPreferencesDto })
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active.')
  list(@CurrentUser() viewer: SessionUser): Promise<NotificationPreferencesDto> {
    return this.preferences.list(viewer);
  }

  @Put(':type')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The preference, as stored.', type: NotificationPreferenceDto })
  @problemDetailsResponse(400, 'The enabled value is missing or not a boolean.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active, or the CSRF token is missing.')
  @problemDetailsResponse(404, 'The notification type is unknown.')
  set(
    @CurrentUser() viewer: SessionUser,
    @Param('type') type: string,
    @Body() body: SetNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    return this.preferences.set(viewer, type, body.enabled);
  }
}
