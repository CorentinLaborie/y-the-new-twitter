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
import { ReactionKind } from '../database/generated/client/client';
import { ReactionResponseDto } from './dto/reaction-response.dto';
import { ReactionsService } from './reactions.service';

/** Question reactions (M2, B3). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('questions/:questionId/reactions')
export class ReactionsController {
  constructor(private readonly questionReactions: ReactionsService) {}

  @Put(':kind')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'kind', enum: ['like', 'dislike', 'y'] })
  @ApiOkResponse({ description: 'The counters after the reaction.', type: ReactionResponseDto })
  @problemDetailsResponse(400, 'The question id is not a UUID, or the kind is not like, dislike or y.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'The question does not exist, or it is hidden or deleted.')
  @problemDetailsResponse(429, 'Too many requests.')
  set(
    @CurrentUser() viewer: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('kind', new ParseEnumPipe(ReactionKind)) kind: ReactionKind,
  ): Promise<ReactionResponseDto> {
    return this.questionReactions.set(viewer, questionId, kind);
  }

  @Delete(':kind')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'kind', enum: ['like', 'dislike', 'y'] })
  @ApiNoContentResponse({ description: 'The reaction of this kind was removed, or there was none.' })
  @problemDetailsResponse(400, 'The question id is not a UUID, or the kind is not like, dislike or y.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(
    403,
    'The account is not active (suspended, pending verification or pending deletion).',
  )
  @problemDetailsResponse(404, 'The question does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(429, 'Too many requests.')
  remove(
    @CurrentUser() viewer: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('kind', new ParseEnumPipe(ReactionKind)) kind: ReactionKind,
  ): Promise<void> {
    return this.questionReactions.remove(viewer, questionId, kind);
  }
}
