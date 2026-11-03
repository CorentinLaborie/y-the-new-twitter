import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { CurrentUser, Public } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { regenerateSession } from '../common/sessions/regenerate-session';
import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_MAX_SESSION_MS,
  ADMIN_REAUTH_WINDOW_MS,
  ADMIN_SIGN_IN_REQUIRED_MESSAGE,
  startElevation,
} from './admin-session';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminReauthDto } from './admin-auth.dto';
import { Admin } from './admin.decorators';

interface AdminUserView {
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

interface AdminLoginResponse {
  readonly status: 'ok';
  readonly user: AdminUserView;
}

/**
 * The back-office sign-in and the re-authentication (DEC-036, DEC-088). Documented in the product doc, not in the public
 * OpenAPI contract: the back-office is not discoverable (DEC-037).
 */
@ApiExcludeController()
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Public()
  @Post('login')
  @AuthRateLimit('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: AdminLoginDto, @Req() req: Request): Promise<AdminLoginResponse> {
    const now = new Date();
    const outcome = await this.adminAuth.login({
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
      case 'ok':
        await regenerateSession(req);
        req.session.userId = outcome.user.id;
        req.session.admin = startElevation(now);
        return { status: 'ok', user: userView(outcome.user) };
    }
  }

  /**
   * Asks again for the password, before a sensitive action (DEC-088). The proof lasts 10 minutes, kept in the session.
   * It does not extend the 8-hour elevation.
   */
  @Admin()
  @AuthRateLimit('login')
  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  async reauthenticate(
    @Body() body: AdminReauthDto,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<{ readonly reauthExpiresAt: string }> {
    const now = new Date();
    const outcome = await this.adminAuth.reauthenticate(
      user.id,
      {
        ipAddress: req.ip ?? '',
        userAgent: req.get('user-agent'),
      },
      body.password,
    );

    if (outcome === 'invalid') {
      throw new UnauthorizedException('Identifiants incorrects');
    }
    req.session.reauth_at = now.toISOString();
    return { reauthExpiresAt: new Date(now.getTime() + ADMIN_REAUTH_WINDOW_MS).toISOString() };
  }

  /** The signed-in administrator and when the back-office session ends: 30 minutes idle, 8 hours at most. */
  @Admin()
  @Get('session')
  session(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): {
    readonly user: AdminUserView;
    readonly idleExpiresAt: string;
    readonly expiresAt: string;
  } {
    const elevation = req.session.admin;
    if (elevation === undefined) {
      throw new UnauthorizedException(ADMIN_SIGN_IN_REQUIRED_MESSAGE);
    }

    return {
      user: userView(user),
      idleExpiresAt: new Date(Date.parse(elevation.lastSeenAt) + ADMIN_IDLE_TIMEOUT_MS).toISOString(),
      expiresAt: new Date(Date.parse(elevation.verifiedAt) + ADMIN_MAX_SESSION_MS).toISOString(),
    };
  }
}

function userView(user: SessionUser): AdminUserView {
  return { handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl };
}
