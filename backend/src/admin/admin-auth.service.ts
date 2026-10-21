import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { LoginService, type LoginAttempt } from '../auth/login/login.service';
import type { SessionUser } from '../auth/session/session-user.repository';
import { MAIL_SENDER, type MailSender } from '../common/mail/mail-sender';
import { UsersRepository } from '../users/users.repository';
import type { AdminMfaSetup } from './admin-session';
import { adminSignInMail } from './admin-sign-in-mail';
import { AdminMfaService, type PendingFactor } from './mfa/admin-mfa.service';
import { AuditLogService } from './audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, type AuditResult } from './audit/audit-log.types';

/**
 * What the back-office login answers. 'invalid' and 'unverified' are the same answers as the user login. The other
 * outcomes come after a correct password: 'code_required' asks for the second factor, 'invalid_code' refuses a wrong
 * one, 'setup_required' sends an account without a second factor to the set-up, and 'ok' is a full sign-in.
 */
type AdminLoginOutcome =
  | { readonly status: 'invalid' }
  | { readonly status: 'unverified' }
  | { readonly status: 'code_required' }
  | { readonly status: 'invalid_code' }
  | { readonly status: 'setup_required'; readonly user: SessionUser }
  | { readonly status: 'ok'; readonly user: SessionUser };

/**
 * The back-office sign-in (DEC-036): the password, then the second factor, then an e-mail alert. An account with no
 * second factor yet is sent to the set-up first, without any elevation (DEC-082).
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly loginService: LoginService,
    private readonly mfa: AdminMfaService,
    private readonly users: UsersRepository,
    private readonly audit: AuditLogService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  async login(
    attempt: Omit<LoginAttempt, 'adminOnly'>,
    code: string | undefined,
    now: Date,
  ): Promise<AdminLoginOutcome> {
    const check = await this.loginService.checkPassword({ ...attempt, adminOnly: true });
    if (check.status !== 'ok') {
      return check;
    }

    if (!(await this.mfa.isEnrolled(check.account.id))) {
      const completed = await this.loginService.completeLogin(check.account, check.event);
      return completed.status === 'success'
        ? { status: 'setup_required', user: completed.user }
        : { status: 'invalid' };
    }

    if (code === undefined) {
      return { status: 'code_required' };
    }

    if (!(await this.mfa.verifyCode(check.account.id, code, now))) {
      await this.loginService.recordFailure(check.account, check.event);
      await this.record(check.account.id, AUDIT_ACTIONS.adminLogin, 'failed');
      return { status: 'invalid_code' };
    }

    const completed = await this.loginService.completeLogin(check.account, check.event);
    if (completed.status !== 'success') {
      return { status: 'invalid' };
    }

    await this.record(check.account.id, AUDIT_ACTIONS.adminLogin, 'ok');
    await this.notifySignIn(check.account.email, now);
    return { status: 'ok', user: completed.user };
  }

  /** A new secret for the set-up. Refused once a second factor is enrolled: it is replaced only by an explicit reset. */
  async startSetup(userId: string, handle: string): Promise<PendingFactor> {
    if (await this.mfa.isEnrolled(userId)) {
      throw new ConflictException('La double authentification est déjà configurée.');
    }

    return this.mfa.startSetup(handle);
  }

  /**
   * Checks the password and a second-factor code again, for the actions that need a fresh proof (DEC-088). The
   * password step counts failures toward the lock, like a sign-in. A wrong code counts too.
   */
  async reauthenticate(
    userId: string,
    network: { ipAddress: string; userAgent: string | undefined },
    proof: { password: string; code: string },
    now: Date,
  ): Promise<'ok' | 'invalid' | 'invalid_code'> {
    const email = await this.users.emailOf(userId);
    if (email === null) {
      return 'invalid';
    }

    const check = await this.loginService.checkPassword({
      email,
      password: proof.password,
      ipAddress: network.ipAddress,
      userAgent: network.userAgent,
      adminOnly: true,
    });
    if (check.status !== 'ok') {
      return 'invalid';
    }

    if (!(await this.mfa.verifyCode(userId, proof.code, now))) {
      await this.loginService.recordFailure(check.account, check.event);
      return 'invalid_code';
    }

    return 'ok';
  }

  /** The codes in clear, or null when the code is wrong. A successful set-up is announced by e-mail, like a sign-in. */
  async confirmSetup(
    userId: string,
    setup: AdminMfaSetup,
    code: string,
    now: Date,
  ): Promise<string[] | null> {
    const codes = await this.mfa.confirmSetup(userId, setup.secretEncrypted, code, now);
    if (codes !== null) {
      await this.record(userId, AUDIT_ACTIONS.mfaEnrol, 'ok');
      const email = await this.users.emailOf(userId);
      if (email !== null) {
        await this.notifySignIn(email, now);
      }
    }

    return codes;
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
