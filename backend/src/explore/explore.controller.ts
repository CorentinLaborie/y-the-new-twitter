import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { ExploreService } from './explore.service';

/** The Explore screen (M4): trends, popular questions and suggested accounts. Logged-in, active accounts only (R13). */
@Controller('explore')
export class ExploreController {
  constructor(private readonly explore: ExploreService) {}

  @Get('trends')
  @ApiOkResponse({ description: 'The hashtags with the most reactions in the last 24 hours.' })
  @problemDetailsResponse(401, 'Not logged in.')
  trends(@CurrentUser() viewer: SessionUser) {
    return this.explore.trends(viewer);
  }

  @Get('popular')
  @ApiOkResponse({ description: 'The visible questions with the most reactions in the last 24 hours.' })
  @problemDetailsResponse(401, 'Not logged in.')
  popular(@CurrentUser() viewer: SessionUser) {
    return this.explore.popular(viewer);
  }

  @Get('suggestions')
  @ApiOkResponse({ description: 'Active accounts the viewer does not follow, best first.' })
  @problemDetailsResponse(401, 'Not logged in.')
  suggestions(@CurrentUser() viewer: SessionUser) {
    return this.explore.suggestions(viewer);
  }
}
