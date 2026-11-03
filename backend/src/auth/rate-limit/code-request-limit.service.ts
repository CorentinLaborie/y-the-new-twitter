import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { ACCOUNT_CODE_REQUEST_POLICY } from './auth-rate-limit.policies';
import { RATE_LIMIT_STORAGE } from './rate-limit.module';

/** The account a code request is for: its id, or the e-mail address when no account has it. */
type CodeRequestAccount = { readonly userId: string } | { readonly email: string };

/**
 * The per-account limit on code requests (section 9.4), counted in PostgreSQL with the IP counters (DEC-194).
 * An address without an account is counted by a hash of the address, so no e-mail address is kept in clear.
 */
@Injectable()
export class CodeRequestLimitService {
  constructor(@Inject(RATE_LIMIT_STORAGE) private readonly storage: ThrottlerStorage) {}

  /**
   * Counts one code request for the account, and tells whether its code may be sent. Above the limit it answers
   * false: the caller then sends nothing, and still answers 202, so the limit is not visible to the client.
   */
  async allow(account: CodeRequestAccount): Promise<boolean> {
    const { limit, windowMs } = ACCOUNT_CODE_REQUEST_POLICY;
    const record = await this.storage.increment(
      `code-request-account:${counterKey(account)}`,
      windowMs,
      limit,
      windowMs,
      'code-request-account',
    );

    return !record.isBlocked;
  }
}

/** The counter key of an account. An account id and an address hash never collide: each has its own prefix. */
function counterKey(account: CodeRequestAccount): string {
  if ('userId' in account) {
    return `id:${account.userId}`;
  }

  return `email:${createHash('sha256').update(account.email.trim().toLowerCase()).digest('hex')}`;
}
