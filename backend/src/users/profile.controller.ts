import { Body, Controller, Patch } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

/** Edit of the signed-in account's profile (plan L1, 1.3). Session and CSRF checks are global guards. */
@Controller('users')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Patch('me')
  @ApiOkResponse({ description: 'The profile after the edit.', type: ProfileDto })
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(409, 'The handle is already used by another account.')
  @problemDetailsResponse(422, 'A field does not meet its rule.')
  update(@CurrentUser() viewer: SessionUser, @Body() body: UpdateProfileDto): Promise<ProfileDto> {
    return this.profiles.update(viewer, body);
  }
}
