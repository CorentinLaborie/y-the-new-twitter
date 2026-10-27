import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { ExploreService } from './explore.service';
import { SearchQueryDto } from './dto/search-query.dto';

/** The Explore search (M4, DEC-022): questions, hashtags and accounts. Logged-in, active accounts only (R13). */
@Controller('search')
export class SearchController {
  constructor(private readonly explore: ExploreService) {}

  @Get()
  @ApiOkResponse({ description: 'The questions, hashtags and accounts matching the text.' })
  @problemDetailsResponse(400, 'The text is empty or longer than 100 characters.')
  @problemDetailsResponse(401, 'Not logged in.')
  search(@CurrentUser() viewer: SessionUser, @Query() query: SearchQueryDto) {
    return this.explore.search(viewer, query.q);
  }
}
