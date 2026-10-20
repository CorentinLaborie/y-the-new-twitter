import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AccountStatus, UserRole } from '../../database/generated/client/client';
import { PUBLIC_KEY, ROLES_KEY, STATUSES_KEY } from './access.decorators';
import { SessionUserService } from './session-user.service';
import type { SessionUser } from './session-user.repository';

type SessionRequest = Request & { sessionUser?: SessionUser };

const DEFAULT_STATUSES: AccountStatus[] = ['active'];

/** The 403 body of a refused account status: the French message (detail) and its stable code (problem details `code`). */
const STATUS_REFUSALS: Partial<Record<AccountStatus, { message: string; code: string }>> = {
  pending_verification: {
    message: 'Votre adresse e-mail n’est pas encore vérifiée.',
    code: 'account_pending_verification',
  },
  suspended: { message: 'Votre compte est suspendu.', code: 'account_suspended' },
  pending_deletion: {
    message: 'Votre compte est en attente de suppression.',
    code: 'account_pending_deletion',
  },
};

/**
 * Global guard (APP_GUARD): every route needs a logged-in user, unless marked @Public().
 * It asks SessionUserService for the decision and only maps it to 401 or 403.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<SessionRequest>();
    const statuses =
      this.reflector.getAllAndOverride<AccountStatus[]>(STATUSES_KEY, targets) ?? DEFAULT_STATUSES;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    const decision = await this.sessions.check(request.session, { statuses, roles });

    if (!decision.allowed) {
      if (decision.reason === 'anonymous') {
        throw new UnauthorizedException('Connexion requise.');
      }
      if (decision.reason === 'status') {
        throw new ForbiddenException(STATUS_REFUSALS[decision.status] ?? { message: 'Accès refusé.' });
      }
      throw new ForbiddenException('Accès refusé.');
    }

    request.sessionUser = decision.user;
    return true;
  }
}
