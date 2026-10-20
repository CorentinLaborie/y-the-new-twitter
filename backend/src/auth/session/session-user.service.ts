import { Injectable } from '@nestjs/common';
import type { AccountStatus, UserRole } from '../../database/generated/client/client';
import { type SessionUser, SessionUserRepository } from './session-user.repository';

/** What a route accepts: account statuses and, optionally, roles. */
interface AccessRules {
  readonly statuses: readonly AccountStatus[];
  readonly roles?: readonly UserRole[];
}

type AccessDecision =
  | { readonly allowed: true; readonly user: SessionUser }
  | { readonly allowed: false; readonly reason: 'anonymous' }
  | { readonly allowed: false; readonly reason: 'status'; readonly status: AccountStatus }
  | { readonly allowed: false; readonly reason: 'role' };

/**
 * The only place that decides who may use a route: a session without a user, an account in a status
 * the route does not accept, or a role the route does not accept. The guard only turns the decision into
 * an HTTP answer. Administrators are ordinary users with the 'admin' role, so the same rules apply.
 */
@Injectable()
export class SessionUserService {
  constructor(private readonly users: SessionUserRepository) {}

  async check(session: { userId?: string } | undefined, rules: AccessRules): Promise<AccessDecision> {
    const userId = session?.userId;
    const user = userId === undefined ? null : await this.users.findById(userId);
    if (user === null) {
      return { allowed: false, reason: 'anonymous' };
    }
    if (!rules.statuses.includes(user.status)) {
      return { allowed: false, reason: 'status', status: user.status };
    }
    if (rules.roles !== undefined && !rules.roles.includes(user.role)) {
      return { allowed: false, reason: 'role' };
    }

    return { allowed: true, user };
  }
}
