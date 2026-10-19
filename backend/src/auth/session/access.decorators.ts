import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccountStatus, UserRole } from '../../database/generated/client/client';
import type { SessionUser } from './session-user.repository';

export const PUBLIC_KEY = 'session:public';
export const STATUSES_KEY = 'session:statuses';
export const ROLES_KEY = 'session:roles';

/** The route needs no logged-in user (signup, login, reset, status, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Account statuses allowed on the route. Default: 'active' only (R13). */
export const AllowStatuses = (...statuses: AccountStatus[]) => SetMetadata(STATUSES_KEY, statuses);

/** Roles allowed on the route, e.g. 'admin' for the back-office. Default: any role. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The user loaded by SessionGuard. Only read it on routes that the guard has checked. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  return context.switchToHttp().getRequest<{ sessionUser: SessionUser }>().sessionUser;
});
