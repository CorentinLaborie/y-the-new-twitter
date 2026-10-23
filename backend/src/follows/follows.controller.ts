import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { FollowListPageDto } from './dto/follow-list-page.dto';
import { FollowListQueryDto } from './dto/follow-list-query.dto';
import { FollowStateDto } from './dto/follow-state.dto';
import { HandleParamDto } from './dto/handle-param.dto';
import { FollowsService } from './follows.service';

/** Follows and the follower and following lists (L3, section 6.2). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('users/:handle')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put('follow')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The viewer follows the account.', type: FollowStateDto })
  @problemDetailsResponse(400, 'The handle is not a valid handle.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(
    404,
    'The account does not exist, is not active, or is blocked in either direction.',
  )
  @problemDetailsResponse(422, 'The viewer tries to follow their own account.')
  @problemDetailsResponse(429, 'Too many requests.')
  follow(@CurrentUser() viewer: SessionUser, @Param() params: HandleParamDto): Promise<FollowStateDto> {
    return this.follows.follow(viewer, params.handle);
  }

  @Delete('follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The viewer no longer follows the account, or did not follow it.' })
  @problemDetailsResponse(400, 'The handle is not a valid handle.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'No account has this handle.')
  @problemDetailsResponse(429, 'Too many requests.')
  unfollow(@CurrentUser() viewer: SessionUser, @Param() params: HandleParamDto): Promise<void> {
    return this.follows.unfollow(viewer, params.handle);
  }

  @Get('followers')
  @ApiOkResponse({
    description: 'One page of the accounts that follow this account.',
    type: FollowListPageDto,
  })
  @problemDetailsResponse(400, 'The handle, the cursor or the limit is not valid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(
    404,
    'The account does not exist, is not active, or is blocked in either direction.',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  followers(
    @CurrentUser() viewer: SessionUser,
    @Param() params: HandleParamDto,
    @Query() query: FollowListQueryDto,
  ): Promise<FollowListPageDto> {
    return this.follows.listFollowers(viewer, params.handle, query);
  }

  @Get('following')
  @ApiOkResponse({
    description: 'One page of the accounts that this account follows.',
    type: FollowListPageDto,
  })
  @problemDetailsResponse(400, 'The handle, the cursor or the limit is not valid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(
    404,
    'The account does not exist, is not active, or is blocked in either direction.',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  following(
    @CurrentUser() viewer: SessionUser,
    @Param() params: HandleParamDto,
    @Query() query: FollowListQueryDto,
  ): Promise<FollowListPageDto> {
    return this.follows.listFollowing(viewer, params.handle, query);
  }
}
