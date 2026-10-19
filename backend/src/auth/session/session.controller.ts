import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './access.decorators';
import { SessionUserService } from './session-user.service';

export interface CurrentSessionResponse {
  readonly user: { readonly handle: string; readonly displayName: string } | null;
}

/** Every status except 'deleted': a suspended account still gets its banner (section 3.4). */
const ALL_LIVE_STATUSES = ['pending_verification', 'active', 'suspended', 'pending_deletion'] as const;

@Controller('auth')
export class SessionController {
  constructor(private readonly sessions: SessionUserService) {}

  /** The logged-in user, or null when there is no session (anonymous visitors get 200, not 401). */
  @Public()
  @Get('session')
  async current(@Req() req: Request): Promise<CurrentSessionResponse> {
    const decision = await this.sessions.check(req.session, { statuses: ALL_LIVE_STATUSES });

    return {
      user: decision.allowed
        ? { handle: decision.user.handle, displayName: decision.user.displayName }
        : null,
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
