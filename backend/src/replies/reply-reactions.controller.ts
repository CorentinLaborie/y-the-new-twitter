import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { ReplyReactionKind } from '../database/generated/client/client';
import { ReplyReactionResponseDto } from './dto/reply-reaction-response.dto';
import { ReplyReactionsService } from './reply-reactions.service';

/** Reply reactions (M3, B6). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('replies/:replyId/reactions')
export class ReplyReactionsController {
  constructor(private readonly replyReactions: ReplyReactionsService) {}

  @Put(':kind')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'kind', enum: ['like', 'dislike'] })
  @ApiOkResponse({ description: 'The counters after the reaction.', type: ReplyReactionResponseDto })
  @problemDetailsResponse(400, 'The reply id is not a UUID, or the kind is not like or dislike.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'The reply does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(429, 'Too many requests.')
  set(
    @CurrentUser() viewer: SessionUser,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @Param('kind', new ParseEnumPipe(ReplyReactionKind)) kind: ReplyReactionKind,
  ): Promise<ReplyReactionResponseDto> {
    return this.replyReactions.set(viewer, replyId, kind);
  }

  @Delete(':kind')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'kind', enum: ['like', 'dislike'] })
  @ApiNoContentResponse({ description: 'The reaction of this kind was removed, or there was none.' })
  @problemDetailsResponse(400, 'The reply id is not a UUID, or the kind is not like or dislike.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'The reply does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(429, 'Too many requests.')
  remove(
    @CurrentUser() viewer: SessionUser,
    @Param('replyId', ParseUUIDPipe) replyId: string,
    @Param('kind', new ParseEnumPipe(ReplyReactionKind)) kind: ReplyReactionKind,
  ): Promise<void> {
    return this.replyReactions.remove(viewer, replyId, kind);
  }
}
