import { Body, Controller, Delete, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { AvatarService } from './avatar.service';
import { AvatarDto } from './dto/avatar.dto';

/**
 * The profile photo of the signed-in account (plan L1, 2.1 and 2.3). The body of the upload is the raw image: the
 * module parses it as bytes for this controller only. Session and CSRF checks are global guards.
 */
@Controller('users')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Put('me/avatar')
  @ApiOkResponse({ description: 'The address of the new photo.', type: AvatarDto })
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active.')
  @problemDetailsResponse(422, 'The file is not a JPEG, PNG or WebP photo of 2 MB at most.')
  async upload(@CurrentUser() viewer: SessionUser, @Body() body: unknown): Promise<AvatarDto> {
    // Anything that is not raw bytes is an empty photo, which the service refuses as a format error.
    const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    const avatarUrl = await this.avatars.upload(viewer, bytes);

    return { avatarUrl };
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active.')
  async remove(@CurrentUser() viewer: SessionUser): Promise<void> {
    await this.avatars.remove(viewer);
  }
}
