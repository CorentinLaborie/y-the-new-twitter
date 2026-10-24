import { Body, Controller, HttpCode, HttpStatus, Put, Req } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { CurrentUser } from '../session/access.decorators';
import type { SessionUser } from '../session/session-user.repository';
import { AccountDeletionDto } from './dto/account-deletion.dto';
import { AccountDeletionResponseDto } from './dto/account-deletion-response.dto';
import { AccountDeletionService } from './account-deletion.service';

@Controller('users')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /**
   * Starts the 90-day deletion window (R16) and answers the purge date (plan L5, step 7). The account is signed out: its
   * sessions are closed and the current one is destroyed. Only an active account reaches this route (the guard's
   * default status). Same limit as the login (decision 9).
   */
  @Put('me/deletion')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit('login')
  @ApiOkResponse({ description: 'The deletion is recorded. The account is purged on the date given.', type: AccountDeletionResponseDto })
  @problemDetailsResponse(422, 'The current password is wrong.')
  @problemDetailsResponse(400, 'The reason is missing or not in the list, the text for Autre is missing, or the e-mail is not valid.')
  @problemDetailsResponse(429, 'Too many requests.')
  async requestDeletion(
    @CurrentUser() user: SessionUser,
    @Body() body: AccountDeletionDto,
    @Req() req: Request,
  ): Promise<AccountDeletionResponseDto> {
    const deletionPurgeAt = await this.deletion.requestDeletion(user.id, body, new Date());
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );

    return { deletionPurgeAt };
  }
}
