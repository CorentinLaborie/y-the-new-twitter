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
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const USER_AGENT_MAX_LENGTH = 255;

export interface LoginAttempt {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string | undefined;
}

/** What the controller turns into an HTTP answer. */
export type LoginOutcome =
  | { readonly status: 'success'; readonly user: SessionUser }
  | { readonly status: 'invalid' }
  | { readonly status: 'unverified' }
  | { readonly status: 'locked'; readonly retryAfterSeconds: number };

interface EventFields {
  ipHash: string;
  userAgent: string | null;
}

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
    const now = new Date();
    const found = await this.users.findByEmail(attempt.email);
    // A deleted account answers like an unknown e-mail address.
    const account = found !== null && found.status !== 'deleted' ? found : null;
    const event: EventFields = {
      ipHash: createHmac('sha256', this.ipHashKey).update(attempt.ipAddress).digest('hex'),
      userAgent: attempt.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    };

    if (account?.lockedUntil && account.lockedUntil > now) {
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return lockedOutcome(account.lockedUntil, now);
    }

    // The password is always compared, even for an unknown address (section 9.4).
    const storedHash = account?.passwordHash ?? (await this.unknownAccountHash);
    const matches = (await verifyPassword(storedHash, attempt.password)) && account !== null;

    if (account === null || !matches) {
      return this.refuseWrongPassword(account, now, event);
    }

    if (account.status === 'pending_verification') {
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'unverified' };
    }

    if (!(await this.attempts.clearAfterSuccess(account.id, now))) {
      // A concurrent failure locked the account while this password was being checked.
      await this.attempts.recordEvent({ userId: account.id, result: 'failure', ...event });
      return { status: 'locked', retryAfterSeconds: LOCK_DURATION_MS / 1000 };
    }

    await this.attempts.recordEvent({ userId: account.id, result: 'success', ...event });
    return {
      status: 'success',
      user: {
        id: account.id,
        handle: account.handle,
        displayName: account.displayName,
        role: account.role,
        status: account.status,
      },
    };
  }

  /**
   * Records the failure. The fifth failure in the window locks the account, and is still answered
   * 'invalid' (401). Only the attempts after the last lock and the last success are counted.
   */
  private async refuseWrongPassword(
    account: User | null,
    now: Date,
    event: EventFields,
  ): Promise<LoginOutcome> {
    await this.attempts.recordEvent({ userId: account?.id ?? null, result: 'failure', ...event });
    if (account !== null) {
      await this.attempts.countFailure(account.id);
      const failures = await this.attempts.countFailuresSince(
        account.id,
        await this.windowStart(account, now),
      );

      if (failures >= MAX_FAILED_LOGINS) {
        await this.attempts.lockUntil(account.id, new Date(now.getTime() + LOCK_DURATION_MS));
      }
    }

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

function lockedOutcome(lockedUntil: Date, now: Date): LoginOutcome {
  return {
    status: 'locked',
    retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
  };
}
