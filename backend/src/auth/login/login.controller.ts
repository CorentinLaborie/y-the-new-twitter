import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { Public } from '../session/access.decorators';
import { LoginDto } from './login.dto';
import { LoginService } from './login.service';

export interface LoginResponse {
  readonly user: { readonly handle: string; readonly displayName: string };
}

@Controller('auth')
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  /** 200 with the user and a SESSION cookie; 401 generic; 403 unverified; 429 with Retry-After when locked. */
  @Public()
  @Post('login')
  @AuthRateLimit('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
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
        throw new ForbiddenException('Votre adresse e-mail n’est pas encore vérifiée.');
      case 'locked':
        res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        throw new HttpException('Trop de tentatives. Réessayez plus tard.', HttpStatus.TOO_MANY_REQUESTS);
      case 'success':
        // A new session ID before the user is recorded, so an old ID cannot be reused (section 13).
        await regenerateSession(req);
        req.session.userId = outcome.user.id;
        return { user: { handle: outcome.user.handle, displayName: outcome.user.displayName } };
    }
  }
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}
