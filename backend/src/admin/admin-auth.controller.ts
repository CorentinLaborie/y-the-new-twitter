import {
  Body,
  ConflictException,
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
  isMfaSetupOpen,
  startElevation,
} from './admin-session';
import { AdminAuthService } from './admin-auth.service';
import { AdminCodeDto, AdminLoginDto, AdminReauthDto } from './admin-auth.dto';
import { Admin } from './admin.decorators';

interface AdminUserView {
  readonly handle: string;
  readonly displayName: string;
}

interface AdminLoginResponse {
  readonly status: 'ok' | 'code_required' | 'setup_required';
  readonly user?: AdminUserView;
}

/**
 * The back-office sign-in and second factor (DEC-036, DEC-082). Documented in the product doc, not in the public
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
    const outcome = await this.adminAuth.login(
      {
        email: body.email,
        password: body.password,
        ipAddress: req.ip ?? '',
        userAgent: req.get('user-agent'),
      },
      body.code,
      now,
    );

    switch (outcome.status) {
      case 'invalid':
        throw new UnauthorizedException('Identifiants incorrects');
      case 'unverified':
        throw new ForbiddenException({
          message: 'Votre adresse e-mail n’est pas encore vérifiée.',
          code: 'account_pending_verification',
        });
      case 'invalid_code':
        throw new UnauthorizedException('Code de vérification incorrect.');
      case 'code_required':
        return { status: 'code_required' };
      case 'setup_required':
        await regenerateSession(req);
        req.session.userId = outcome.user.id;
        return { status: 'setup_required' };
      case 'ok':
        await regenerateSession(req);
        req.session.userId = outcome.user.id;
        req.session.admin = startElevation(now);
        return { status: 'ok', user: userView(outcome.user) };
    }
  }

  /** The set-up of the second factor: a secret to type into an authenticator application. Nothing is enrolled yet. */
  @Admin({ elevated: false })
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async startMfaSetup(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<{ readonly secret: string; readonly otpauthUri: string }> {
    const pending = await this.adminAuth.startSetup(user.id, user.handle);
    req.session.adminMfaSetup = {
      secretEncrypted: pending.secretEncrypted,
      startedAt: new Date().toISOString(),
    };

    return { secret: pending.secret, otpauthUri: pending.otpauthUri };
  }

  /** Confirms the set-up with a first code. The backup codes are returned once, and the session is elevated. */
  @Admin({ elevated: false })
  @AuthRateLimit('code-confirm')
  @Post('mfa/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmMfaSetup(
    @Body() body: AdminCodeDto,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
  ): Promise<{ readonly backupCodes: string[] }> {
    const now = new Date();
    const setup = req.session.adminMfaSetup;
    if (!isMfaSetupOpen(setup, now)) {
      req.session.adminMfaSetup = undefined;
      throw new ConflictException('Aucune configuration en cours. Recommencez.');
    }

    const codes = await this.adminAuth.confirmSetup(user.id, setup, body.code, now);
    if (codes === null) {
      throw new UnauthorizedException('Code de vérification incorrect.');
    }

    req.session.adminMfaSetup = undefined;
    req.session.admin = startElevation(now);
    return { backupCodes: codes };
  }

  /**
   * Asks again for the password and a second-factor code, before a sensitive action (DEC-088). The proof lasts 10
   * minutes, kept in the session. It does not extend the 8-hour elevation.
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
      { ipAddress: req.ip ?? '', userAgent: req.get('user-agent') },
      { password: body.password, code: body.code },
      now,
    );

    switch (outcome) {
      case 'invalid':
        throw new UnauthorizedException('Identifiants incorrects');
      case 'invalid_code':
        throw new UnauthorizedException('Code de vérification incorrect.');
      case 'ok':
        req.session.adminReauthAt = now.toISOString();
        return { reauthExpiresAt: new Date(now.getTime() + ADMIN_REAUTH_WINDOW_MS).toISOString() };
    }
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
  return { handle: user.handle, displayName: user.displayName };
}
