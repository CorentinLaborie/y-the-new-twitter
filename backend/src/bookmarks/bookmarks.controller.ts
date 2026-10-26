import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { FollowListQueryDto } from '../follows/dto/follow-list-query.dto';
import { BookmarksService } from './bookmarks.service';
import { BookmarkPageDto } from './dto/bookmark-page.dto';
import { BookmarkStateDto } from './dto/bookmark-state.dto';

/** Saved questions (L4). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller()
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Put('questions/:questionId/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiOkResponse({ description: 'The question is saved.', type: BookmarkStateDto })
  @problemDetailsResponse(400, 'The question id is not a UUID.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'The question does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(429, 'Too many requests.')
  save(
    @CurrentUser() viewer: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ): Promise<BookmarkStateDto> {
    return this.bookmarks.save(viewer, questionId);
  }

  @Delete('questions/:questionId/bookmark')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'questionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The question is no longer saved, or it was not saved.' })
  @problemDetailsResponse(400, 'The question id is not a UUID.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  remove(
    @CurrentUser() viewer: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ): Promise<void> {
    return this.bookmarks.remove(viewer, questionId);
  }

  @Get('bookmarks')
  @ApiOkResponse({
    description: 'The saved questions, the most recently saved first, with a cursor for the next page.',
    type: BookmarkPageDto,
  })
  @problemDetailsResponse(400, 'The cursor or the limit is invalid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(429, 'Too many requests.')
  list(@CurrentUser() viewer: SessionUser, @Query() query: FollowListQueryDto): Promise<BookmarkPageDto> {
    return this.bookmarks.list(viewer, query);
  }
}
