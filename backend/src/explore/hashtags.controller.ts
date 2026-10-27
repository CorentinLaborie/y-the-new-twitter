import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { HashtagQueryDto } from './dto/search-query.dto';
import { ExploreService } from './explore.service';

/** A hashtag: letters, digits and underscore, 1 to 50 characters, without the leading #. */
const HASHTAG_PATTERN = /^[\p{L}\p{N}_]{1,50}$/u;

/** The questions of one hashtag (M4, section 3.2). Logged-in, active accounts only (R13). */
@Controller('hashtags')
export class HashtagsController {
  constructor(private readonly explore: ExploreService) {}

  @Get(':tag/questions')
  @ApiOkResponse({ description: 'One page of the visible questions with this hashtag, newest first.' })
  @problemDetailsResponse(400, 'Invalid hashtag, cursor or limit.')
  @problemDetailsResponse(401, 'Not logged in.')
  questions(@CurrentUser() viewer: SessionUser, @Param('tag') tag: string, @Query() query: HashtagQueryDto) {
    if (!HASHTAG_PATTERN.test(tag)) {
      throw new BadRequestException('Hashtag invalide.');
    }

    return this.explore.hashtagPage(viewer, tag, query.cursor, query.limit);
  }
}
