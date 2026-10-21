import { Body, Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { EmailChangeConfirmDto } from './dto/email-change-confirm.dto';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { EmailChangeService } from './email-change.service';

/** Logged-in, active accounts only: the global SessionGuard enforces it (default status: active). */
@Controller('auth/email-change')
export class EmailChangeController {
  constructor(private readonly emailChange: EmailChangeService) {}

  @Post('request')
  @AuthRateLimit('code-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @problemDetailsResponse(422, 'The current password is wrong.')
  request(@Req() req: Request, @Body() body: EmailChangeRequestDto): Promise<void> {
    return this.emailChange.requestChange(sessionUserId(req), body.newEmail, body.password);
  }

  @Post('confirm')
  @AuthRateLimit('code-confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: Request, @Body() body: EmailChangeConfirmDto): Promise<void> {
    return this.emailChange.confirmChange(sessionUserId(req), body.code);
  }
}

function sessionUserId(req: Request): string {
  const userId = req.session.userId;
  if (!userId) {
    throw new UnauthorizedException('Vous devez être connecté.');
  }

  return userId;
}
