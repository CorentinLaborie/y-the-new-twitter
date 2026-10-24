import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { AccountSettingsDto } from './dto/account-settings.dto';
import { AccountSettingsService } from './account-settings.service';

/** The account of the signed-in viewer (plan L5, step 2). Only an active account reaches it (R13). */
@Controller('users')
export class AccountSettingsController {
  constructor(private readonly accounts: AccountSettingsService) {}

  @Get('me/account')
  @ApiOkResponse({ description: 'The viewer’s account.', type: AccountSettingsDto })
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  read(@CurrentUser() viewer: SessionUser): Promise<AccountSettingsDto> {
    return this.accounts.read(viewer);
  }
}
