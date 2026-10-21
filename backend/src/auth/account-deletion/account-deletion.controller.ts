import { Body, Controller, HttpCode, HttpStatus, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import { CurrentUser } from '../session/access.decorators';
import type { SessionUser } from '../session/session-user.repository';
import { AccountDeletionDto } from './dto/account-deletion.dto';
import { AccountDeletionService } from './account-deletion.service';

@Controller('users')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /**
   * Starts the 90-day deletion window (R16). The account is signed out: its sessions are closed and the current one
   * is destroyed. Only an active account reaches this route (the guard's default status).
   */
  @Put('me/deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @problemDetailsResponse(422, 'The current password is wrong.')
  async requestDeletion(
    @CurrentUser() user: SessionUser,
    @Body() body: AccountDeletionDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.deletion.requestDeletion(user.id, body.password, new Date());
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
  }
}
