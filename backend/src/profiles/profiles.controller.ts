import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';
import { HandleParamDto } from '../follows/dto/handle-param.dto';
import { ProfileQuestionsPageDto } from './dto/profile-questions-page.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { ProfilesService } from './profiles.service';

/** Public profiles (L1). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('users/:handle')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiParam({ name: 'handle', type: String })
  @ApiOkResponse({ description: 'The public profile of the account.', type: ProfileResponseDto })
  @problemDetailsResponse(400, 'The handle is not a valid handle.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The viewer’s account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(
    404,
    'The account does not exist, is not active, or is blocked in either direction.',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  profile(@CurrentUser() viewer: SessionUser, @Param() params: HandleParamDto): Promise<ProfileResponseDto> {
    return this.profiles.profile(viewer, params.handle);
  }

  @Get('questions')
  @ApiOkResponse({
    description: 'One page of the questions of the account, newest first.',
    type: ProfileQuestionsPageDto,
  })
  @problemDetailsResponse(400, 'The handle, the cursor or the limit is not valid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The viewer’s account is not active.')
  @problemDetailsResponse(
    404,
    'The account does not exist, is not active, or is blocked in either direction.',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  questions(
    @CurrentUser() viewer: SessionUser,
    @Param() params: HandleParamDto,
    @Query() query: FollowListQueryDto,
  ): Promise<ProfileQuestionsPageDto> {
    return this.profiles.questions(viewer, params.handle, query);
  }
}
