import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SessionUserService } from '../auth/session/session-user.service';
import type { SessionUser } from '../auth/session/session-user.repository';
import { ADMIN_SIGN_IN_REQUIRED_MESSAGE, isElevated } from './admin-session';
import { ADMIN_ELEVATION_KEY } from './admin.decorators';

type AdminRequest = Request & { sessionUser?: SessionUser };

/**
 * Guard of the back-office routes. Anyone who is not an active administrator gets 404, so the back-office is not
 * revealed (DEC-037). An administrator without a current elevation gets 401 (DEC-036).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const decision = await this.sessions.check(request.session, { statuses: ['active'], roles: ['admin'] });
    if (!decision.allowed) {
      throw new NotFoundException();
    }

    const targets = [context.getHandler(), context.getClass()];
    const elevationRequired = this.reflector.getAllAndOverride<boolean>(ADMIN_ELEVATION_KEY, targets) ?? true;
    if (elevationRequired) {
      const now = new Date();
      const elevation = request.session.admin;
      if (elevation === undefined || !isElevated(elevation, now)) {
        request.session.admin = undefined;
        throw new UnauthorizedException(ADMIN_SIGN_IN_REQUIRED_MESSAGE);
      }
      // Each request of the back-office keeps the 30-minute idle timer running.
      request.session.admin = { ...elevation, lastSeenAt: now.toISOString() };
    }

    request.sessionUser = decision.user;
    return true;
  }
}
