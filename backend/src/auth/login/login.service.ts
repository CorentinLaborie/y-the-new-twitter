import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import type { User } from '../../database/generated/client/client';
import { UsersRepository } from '../../users/users.repository';
import { hashPassword, verifyPassword } from '../password';
import type { SessionUser } from '../session/session-user.repository';
import { LoginAttemptsRepository } from './login-attempts.repository';

/** Failed attempts on one account before it is locked (section 9.4). */
export const MAX_FAILED_LOGINS = 5;
/** Lock duration after the fifth failure, in milliseconds (section 9.4). */
export const LOCK_DURATION_MS = 15 * 60 * 1000;
/** Failures count within this window, in milliseconds (section 9.4: 5 failures in 15 minutes). */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const USER_AGENT_MAX_LENGTH = 255;

export interface LoginAttempt {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string | undefined;
  /** Back-office login (DEC-036): only an account with the admin role can pass. Any other account is refused like a wrong password. */
  adminOnly?: boolean;
}

/** True while a pending deletion is inside its 90-day window (R16). */
function deletionWindowOpen(account: User, now: Date): boolean {
  return account.deletionPurgeAt !== null && account.deletionPurgeAt > now;
}

/**
 * True when a login cancels the pending deletion of this account (R16, DEC-030): only a deletion the user started, and
 * only inside the window. A deletion an administrator started is never cancelled by a login.
 */
function loginCancelsDeletion(account: User, now: Date): boolean {
  return account.deletionOrigin === 'user' && deletionWindowOpen(account, now);
}

/** The fields every login_events row of one attempt carries. */
interface LoginEventFields {
  ipHash: string;
  userAgent: string | null;
}

/**
 * What the controller turns into an HTTP answer. A locked account answers 'invalid', like a wrong password, so the
 * caller cannot tell that the account is locked (section 9.4).
 */
type LoginOutcome =
  | { readonly status: 'success'; readonly user: SessionUser }
  | { readonly status: 'invalid' }
  | { readonly status: 'unverified' };

/**
 * The password step. Only 'ok' keeps the account for the next step: a second factor for the back-office, then
 * completeLogin. A success is not recorded here, so a wrong second factor still counts toward the lock.
 */
type PasswordCheck =
  | { readonly status: 'ok'; readonly account: User; readonly event: LoginEventFields }
  | { readonly status: 'invalid' }
  | { readonly status: 'unverified' };

/**
 * Checks the credentials and keeps the account counters (DEC-141). The IP limits of section 9.4 are not
 * here: they are a separate decorator. Every attempt is written to login_events (DEC-060).
 */
@Injectable()
export class LoginService {
  private readonly ipHashKey: string;
  /** Hash that an unknown e-mail is compared with, so unknown and known accounts take the same time. */
  private readonly unknownAccountHash: Promise<string>;

  constructor(
    config: ConfigService,
    private readonly users: UsersRepository,
    private readonly attempts: LoginAttemptsRepository,
  ) {
    this.ipHashKey = config.getOrThrow<string>('IP_HASH_KEY');
    this.unknownAccountHash = hashPassword(randomBytes(32).toString('base64url'));
  }

  async login(attempt: LoginAttempt): Promise<LoginOutcome> {
    const check = await this.checkPassword(attempt);
    if (check.status !== 'ok') {
      return check;
    }

    return this.completeLogin(check.account, check.event);
  }

  async checkPassword(attempt: LoginAttempt): Promise<PasswordCheck> {
    const now = new Date();
    const found = await this.users.findByEmail(attempt.email);
    // A deleted account answers like an unknown e-mail address.
    const account = found !== null && found.status !== 'deleted' ? found : null;
    const event: LoginEventFields = {
      ipHash: createHmac('sha256', this.ipHashKey).update(attempt.ipAddress).digest('hex'),
      userAgent: attempt.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    };

    // The password is always compared, even for an unknown address or a locked account, so the answer takes
    // the same time whatever the account state (section 9.4).
    const storedHash = account?.passwordHash ?? (await this.unknownAccountHash);
    const passwordMatches = await verifyPassword(storedHash, attempt.password);
    const matches =
      passwordMatches && account !== null && (attempt.adminOnly !== true || account.role === 'admin');

    if (account?.lockedUntil && account.lockedUntil > now) {
      // A locked account is not counted again, and is refused even with the right password.
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'invalid' };
    }

    if (account === null || !matches) {
      return this.refuseWrongPassword(account, event);
    }

    if (account.status === 'pending_verification') {
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'unverified' };
    }

    if (account.status === 'pending_deletion' && !loginCancelsDeletion(account, now)) {
      // The 90-day window is over, or an administrator started the deletion: refused like an unknown address, and
      // until the purge removes the account (R16). Only a deletion the user started can be cancelled by a login.
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'invalid' };
    }

    return { status: 'ok', account, event };
  }

  /**
   * Clears the counters and records the success. A lock set in the meantime refuses the login. A login during the
   * deletion window cancels the user's own deletion: the account is active again (R16, DEC-030).
   */
  async completeLogin(account: User, event: LoginEventFields): Promise<LoginOutcome> {
    const now = new Date();
    if (!(await this.attempts.clearAfterSuccess(account.id, now))) {
      // A concurrent failure locked the account while this password was being checked.
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'invalid' };
    }

    let status = account.status;
    if (status === 'pending_deletion') {
      if (!(await this.users.cancelDeletion(account.id, now))) {
        // The window closed while this password was being checked.
        await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
        return { status: 'invalid' };
      }
      status = 'active';
    }

    await this.attempts.recordEvent({ userId: account.id, result: 'success', ...event });
    return {
      status: 'success',
      user: {
        id: account.id,
        handle: account.handle,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        role: account.role,
        status,
      },
    };
  }

  /**
   * Records one failed attempt on a known account (a wrong password, or a wrong second factor). The fifth failure in
   * the window locks the account (section 9.4). Only the attempts after the last lock and the last success are counted.
   */
  async recordFailure(account: User, event: LoginEventFields): Promise<void> {
    const now = new Date();
    await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
    await this.attempts.countFailure(account.id);
    const failures = await this.attempts.countFailuresSince(account.id, await this.windowStart(account, now));

    if (failures >= MAX_FAILED_LOGINS) {
      await this.attempts.lockUntil(account.id, new Date(now.getTime() + LOCK_DURATION_MS));
    }
  }

  private async refuseWrongPassword(account: User | null, event: LoginEventFields): Promise<PasswordCheck> {
    if (account === null) {
      await this.attempts.recordEvent({ userId: null, result: 'failure', ...event });
      return { status: 'invalid' };
    }

    await this.recordFailure(account, event);
    return { status: 'invalid' };
  }

  /** The earliest attempt that still counts: 15 minutes ago, or the last lock or success if later. */
  private async windowStart(account: User, now: Date): Promise<Date> {
    const starts = [new Date(now.getTime() - FAILURE_WINDOW_MS)];
    if (account.lockedUntil !== null) {
      starts.push(account.lockedUntil);
    }
    const lastSuccess = await this.attempts.lastSuccessAt(account.id);
    if (lastSuccess !== null) {
      starts.push(lastSuccess);
    }

    return new Date(Math.max(...starts.map((date) => date.getTime())));
  }
}
