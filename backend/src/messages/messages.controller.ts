import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { ConversationListQueryDto, MessageQueryDto, MessageTextDto, StartConversationDto } from './dto/messages.dto';
import { MessagesService, type ConversationView, type MessageView } from './messages.service';

/** Private messages (section 9 of the conditions). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({ description: 'The conversation the message was written in.' })
  @problemDetailsResponse(400, 'The handle or the text is missing, blank, or longer than 1000 characters.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'No account has this handle, or it is not visible to the viewer (R14).')
  @problemDetailsResponse(422, 'The viewer writes to themselves.')
  start(@CurrentUser() viewer: SessionUser, @Body() body: StartConversationDto): Promise<{ conversationId: string }> {
    return this.messages.start(viewer, body, new Date());
  }

  @Get('conversations')
  @ApiOkResponse({ description: 'One page of the conversations, or of the requests waiting for the viewer.' })
  @problemDetailsResponse(400, 'The cursor or the limit is invalid.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  list(
    @CurrentUser() viewer: SessionUser,
    @Query() query: ConversationListQueryDto,
  ): Promise<{ conversations: ConversationView[]; nextCursor: string | null }> {
    return this.messages.list(viewer, query);
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @problemDetailsResponse(400, 'The text is missing, blank, or longer than 1000 characters.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(404, 'The conversation does not exist for the viewer, or the other account is not visible.')
  @problemDetailsResponse(409, 'The request is declined, waits for an answer, or already has the message of its initiator.')
  send(
    @CurrentUser() viewer: SessionUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: MessageTextDto,
  ): Promise<MessageView> {
    return this.messages.send(viewer, conversationId, body.text, new Date());
  }

  @Get('conversations/:conversationId/messages')
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiOkResponse({ description: 'One page of the messages, the newest first.' })
  @problemDetailsResponse(400, 'The conversation id is not a UUID, or the cursor or the limit is invalid.')
  @problemDetailsResponse(404, 'The conversation does not exist for the viewer, or the other account is not visible.')
  messagesOf(
    @CurrentUser() viewer: SessionUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: MessageQueryDto,
  ): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
    return this.messages.messagesOf(viewer, conversationId, query);
  }

  @Put('conversations/:conversationId/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The request is accepted.' })
  @problemDetailsResponse(404, 'The conversation does not exist for the viewer.')
  @problemDetailsResponse(409, 'The request is not waiting for the viewer any more.')
  accept(@CurrentUser() viewer: SessionUser, @Param('conversationId', ParseUUIDPipe) conversationId: string): Promise<void> {
    return this.messages.accept(viewer, conversationId);
  }

  @Put('conversations/:conversationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The request is declined.' })
  @problemDetailsResponse(404, 'The conversation does not exist for the viewer.')
  @problemDetailsResponse(409, 'The request is not waiting for the viewer any more.')
  decline(@CurrentUser() viewer: SessionUser, @Param('conversationId', ParseUUIDPipe) conversationId: string): Promise<void> {
    return this.messages.decline(viewer, conversationId);
  }

  @Put('conversations/:conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The conversation is read up to now.' })
  @problemDetailsResponse(404, 'The conversation does not exist for the viewer.')
  read(@CurrentUser() viewer: SessionUser, @Param('conversationId', ParseUUIDPipe) conversationId: string): Promise<void> {
    return this.messages.markRead(viewer, conversationId, new Date());
  }
}
