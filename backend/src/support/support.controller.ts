import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { AllowStatuses, CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { SupportMessageResponseDto } from './dto/support-message-response.dto';
import { SupportService } from './support.service';

/** Contact messages of suspended accounts (section 3.4). The route allows the suspended status only (DEC-078). */
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('messages')
  @AllowStatuses('suspended')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreateSupportMessageDto })
  @ApiCreatedResponse({
    description: 'The message was added to the open thread of the account, or to a new thread. Returns its reference.',
    type: SupportMessageResponseDto,
  })
  @problemDetailsResponse(400, 'The body has no text field, or the text is not a string.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not suspended (the session guard refuses every other status).')
  @problemDetailsResponse(422, 'The text is not 1 to 1000 characters once trimmed.')
  @problemDetailsResponse(429, 'Too many requests.')
  send(
    @CurrentUser() viewer: SessionUser,
    @Body() dto: CreateSupportMessageDto,
  ): Promise<SupportMessageResponseDto> {
    return this.support.sendMessage(viewer, dto);
  }
}
