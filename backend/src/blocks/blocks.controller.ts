import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';
import { HandleParamDto } from '../follows/dto/handle-param.dto';
import { BlockPageDto } from './dto/block-page.dto';
import { BlocksService } from './blocks.service';

/** Blocks and the list of blocked accounts (plan L6, S2). Logged-in, active accounts only (R13). */
@Controller()
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Put('users/:handle/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The account is blocked. Blocking it again changes nothing.' })
  @problemDetailsResponse(400, 'The handle is not a valid handle.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'No active account has this handle.')
  @problemDetailsResponse(422, 'The viewer tries to block their own account.')
  @problemDetailsResponse(429, 'Too many requests.')
  block(@CurrentUser() viewer: SessionUser, @Param() params: HandleParamDto): Promise<void> {
    return this.blocks.block(viewer, params.handle);
  }

  @Delete('users/:handle/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The block is lifted, or there was none.' })
  @problemDetailsResponse(400, 'The handle is not a valid handle.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  unblock(@CurrentUser() viewer: SessionUser, @Param() params: HandleParamDto): Promise<void> {
    return this.blocks.unblock(viewer, params.handle);
  }

  @Get('users/me/blocks')
  @ApiOkResponse({ description: 'One page of the accounts the viewer blocks.', type: BlockPageDto })
  @problemDetailsResponse(400, 'The cursor or the limit is not valid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  list(@CurrentUser() viewer: SessionUser, @Query() query: FollowListQueryDto): Promise<BlockPageDto> {
    return this.blocks.list(viewer, query);
  }
}
