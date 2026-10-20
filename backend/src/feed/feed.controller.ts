import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { FeedPageDto } from './dto/feed-page.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

/** The home feed (M2). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @ApiOkResponse({ description: 'One page of the feed.', type: FeedPageDto })
  @problemDetailsResponse(400, 'Unknown tab, invalid limit or invalid cursor.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(429, 'Too many requests.')
  forYou(@CurrentUser() viewer: SessionUser, @Query() query: FeedQueryDto): Promise<FeedPageDto> {
    return this.feed.forYou(viewer, query);
  }
}
