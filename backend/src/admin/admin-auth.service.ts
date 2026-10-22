import { Inject, Injectable, Logger } from '@nestjs/common';
import { LoginService, type LoginAttempt } from '../auth/login/login.service';
import type { SessionUser } from '../auth/session/session-user.repository';
import { MAIL_SENDER, type MailSender } from '../common/mail/mail-sender';
import { UsersRepository } from '../users/users.repository';
import { adminSignInMail } from './admin-sign-in-mail';
import { AuditLogService } from './audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, type AuditResult } from './audit/audit-log.types';

/**
 * What the back-office sign-in answers. 'invalid' and 'unverified' are the same answers as the user login. 'ok' is a
 * full sign-in: the password is the only proof.
 */
type AdminLoginOutcome =
  | { readonly status: 'invalid' }
  | { readonly status: 'unverified' }
  | { readonly status: 'ok'; readonly user: SessionUser };

/**
 * The back-office sign-in (DEC-036): the email and the password of an active administrator, then an e-mail alert.
 * The second factor is not used.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly loginService: LoginService,
    private readonly users: UsersRepository,
    private readonly audit: AuditLogService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  async login(attempt: Omit<LoginAttempt, 'adminOnly'>, now: Date): Promise<AdminLoginOutcome> {
    const check = await this.loginService.checkPassword({ ...attempt, adminOnly: true });
    if (check.status !== 'ok') {
      return check;
    }

    const completed = await this.loginService.completeLogin(check.account, check.event);
    if (completed.status !== 'success') {
      return { status: 'invalid' };
    }

    await this.record(check.account.id, AUDIT_ACTIONS.adminLogin, 'ok');
    await this.notifySignIn(check.account.email, now);
    return { status: 'ok', user: completed.user };
  }

  /** The password again, for the sensitive actions (DEC-088). Counts a wrong password toward the lock, like a sign-in. */
  async reauthenticate(
    userId: string,
    network: { ipAddress: string; userAgent: string | undefined },
    password: string,
  ): Promise<'ok' | 'invalid'> {
    const email = await this.users.emailOf(userId);
    if (email === null) {
      return 'invalid';
    }

    const check = await this.loginService.checkPassword({
      email,
      password,
      ipAddress: network.ipAddress,
      userAgent: network.userAgent,
      adminOnly: true,
    });
    return check.status === 'ok' ? 'ok' : 'invalid';
  }

  /**
   * Writes one back-office action to the audit log. A failed write fails the request: an administrator action is not
   * done without its trace.
   */
  private record(userId: string, action: string, result: AuditResult): Promise<void> {
    return this.audit.append({
      actorId: userId,
      action,
      result,
      targetType: AUDIT_TARGET_TYPES.user,
      targetId: userId,
      reason: null,
      details: null,
    });
  }

  /**
   * An alert the administrator must see. A failed send does not refuse the sign-in, but it is logged without the
   * address, so the failure is not silent.
   */
  private async notifySignIn(to: string, at: Date): Promise<void> {
    try {
      await this.mail.send(adminSignInMail(to, at));
    } catch {
      this.logger.error('The back-office sign-in alert could not be sent.');
    }
  }
}
