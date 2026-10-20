import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOkResponse } from '@nestjs/swagger';
import { regenerateSession } from '../../common/sessions/regenerate-session';
import { problemDetailsResponse } from '../../common/problem-details/problem-details.swagger';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { Public } from '../session/access.decorators';
import { LoginDto } from './login.dto';
import { LoginService } from './login.service';

interface LoginResponse {
  readonly user: { readonly handle: string; readonly displayName: string };
}

@Controller('auth')
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  /** 200 with the user and a SESSION cookie; 401 generic, also when the account is locked; 403 unverified. */
  @Public()
  @Post('login')
  @AuthRateLimit('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'The user, with a SESSION cookie.' })
  @problemDetailsResponse(
    401,
    'Wrong e-mail or password. Also the answer while the account is locked after 5 failures, so the lock is not revealed.',
  )
  @problemDetailsResponse(403, 'The e-mail address is not verified yet (code account_pending_verification).')
  @problemDetailsResponse(429, 'Too many requests from this IP address (20 attempts in 15 minutes).')
  async login(@Body() body: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    const outcome = await this.loginService.login({
      email: body.email,
      password: body.password,
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent'),
    });

    switch (outcome.status) {
      case 'invalid':
        throw new UnauthorizedException('Identifiants incorrects');
      case 'unverified':
        throw new ForbiddenException({
          message: 'Votre adresse e-mail n’est pas encore vérifiée.',
          code: 'account_pending_verification',
        });
      case 'success':
        await regenerateSession(req);
        req.session.userId = outcome.user.id;
        return { user: { handle: outcome.user.handle, displayName: outcome.user.displayName } };
    }
  }
}
