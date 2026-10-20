import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { CreateReplyDto } from './dto/create-reply.dto';
import { ReplyPageDto } from './dto/reply-page.dto';
import { ReplyQueryDto } from './dto/reply-query.dto';
import { ReplyResponseDto } from './dto/reply-response.dto';
import { RepliesService } from './replies.service';

/** Replies (M3, B3 to B5). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller()
export class RepliesController {
  constructor(private readonly replies: RepliesService) {}

  @Post('questions/:questionId/replies')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Repeated with the same text on the same question, returns the first reply. Section 9.1.',
  })
  @ApiCreatedResponse({
    description: 'The reply.',
    type: ReplyResponseDto,
    headers: { Location: { description: 'Path of the new reply.', schema: { type: 'string' } } },
  })
  @problemDetailsResponse(400, 'The question id is not a UUID, or the Idempotency-Key is empty or too long.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'The question does not exist, or it is hidden, deleted or blocked.')
  @problemDetailsResponse(422, 'The text is empty or longer than 280 characters, the conversation is not open yet, or the key was used for another request.')
  @problemDetailsResponse(429, 'Too many requests.')
  async create(
    @CurrentUser() author: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: CreateReplyDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReplyResponseDto> {
    const reply = await this.replies.create(author, questionId, body, idempotencyKey);
    response.setHeader('Location', `/api/v1/replies/${reply.id}`);

    return reply;
  }

  @Get('questions/:questionId/replies')
  @ApiOkResponse({ description: 'One page of replies, oldest first.', type: ReplyPageDto })
  @problemDetailsResponse(400, 'The question id is not a UUID, the cursor is invalid, or the limit is out of range.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'The question does not exist, or it is hidden, deleted or blocked.')
  list(
    @CurrentUser() viewer: SessionUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Query() query: ReplyQueryDto,
  ): Promise<ReplyPageDto> {
    return this.replies.list(viewer, questionId, query);
  }

  @Delete('replies/:replyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The reply was deleted.' })
  @problemDetailsResponse(400, 'The reply id is not a UUID.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The reply belongs to another account.')
  @problemDetailsResponse(404, 'The reply does not exist or was already deleted.')
  remove(@CurrentUser() viewer: SessionUser, @Param('replyId', ParseUUIDPipe) replyId: string): Promise<void> {
    return this.replies.remove(viewer, replyId);
  }
}
