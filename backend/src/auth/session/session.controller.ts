import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from './access.decorators';
import { CurrentSessionResponseDto } from './dto/current-session-response.dto';
import { SessionUserRepository, type SessionUser } from './session-user.repository';
import { SessionUserService } from './session-user.service';

/** Every status except 'deleted': a suspended account still gets its banner (section 3.4). */
const ALL_LIVE_STATUSES = ['pending_verification', 'active', 'suspended', 'pending_deletion'] as const;

@Controller('auth')
export class SessionController {
  constructor(
    private readonly sessions: SessionUserService,
    private readonly users: SessionUserRepository,
  ) {}

  /** The logged-in user, or null when there is no session (anonymous visitors get 200, not 401). */
  @Public()
  @Get('session')
  @ApiOkResponse({ type: CurrentSessionResponseDto })
  async current(@Req() req: Request): Promise<CurrentSessionResponseDto> {
    const decision = await this.sessions.check(req.session, { statuses: ALL_LIVE_STATUSES });

    return { user: decision.allowed ? await this.toCurrentUser(decision.user) : null };
  }

  /**
   * The banner's fields. The suspension reason is read only for a suspended account: a reason stored for an account
   * that is no longer suspended is never sent.
   */
  private async toCurrentUser(user: SessionUser) {
    return {
      handle: user.handle,
      displayName: user.displayName,
      status: user.status,
      suspensionReason: user.status === 'suspended' ? await this.users.suspensionReasonOf(user.id) : null,
    };
  }

  /** Destroys the session on the server: its row in the sessions table is deleted. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
  }
}
