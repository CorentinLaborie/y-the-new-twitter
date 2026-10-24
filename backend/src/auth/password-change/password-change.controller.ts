import { Body, Controller, HttpCode, HttpStatus, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { CurrentUser } from '../session/access.decorators';
import type { SessionUser } from '../session/session-user.repository';
import { PasswordChangeDto } from './dto/password-change.dto';
import { PasswordChangeService } from './password-change.service';

/** The password of the signed-in account (plan L5, step 3). Only an active account reaches it (R13). */
@Controller('users')
export class PasswordChangeController {
  constructor(private readonly passwords: PasswordChangeService) {}

  @Put('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthRateLimit('login')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(422, 'The current password is wrong, or the new one does not meet the policy.')
  @problemDetailsResponse(429, 'Too many requests.')
  async change(
    @CurrentUser() viewer: SessionUser,
    @Body() body: PasswordChangeDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.passwords.change(viewer, req.sessionID, body);
  }
}
