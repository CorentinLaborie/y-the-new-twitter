import type { ThrottlerStorage } from '@nestjs/throttler';
import { CodeRequestLimitService } from './code-request-limit.service';

/**
 * A fixed-window counter in memory, standing in for the PostgreSQL store (its own spec covers that store).
 * Only the count and the block matter to CodeRequestLimitService, so the window never ends in these tests.
 */
class CountingStorage implements ThrottlerStorage {
  readonly counters = new Map<string, number>();

  async increment(key: string, _ttl: number, limit: number) {
    const totalHits = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, totalHits);

    const isBlocked = totalHits > limit;

    return { totalHits, timeToExpire: 3600, isBlocked, timeToBlockExpire: isBlocked ? 3600 : 0 };
  }
}

describe('CodeRequestLimitService (section 9.4)', () => {
  let storage: CountingStorage;
  let limit: CodeRequestLimitService;

  beforeEach(() => {
    storage = new CountingStorage();
    limit = new CodeRequestLimitService(storage);
  });

  it('allows 3 code requests per account, then refuses the 4th', async () => {
    const account = { userId: 'user-1' };

    expect(await limit.allow(account)).toBe(true);
    expect(await limit.allow(account)).toBe(true);
    expect(await limit.allow(account)).toBe(true);
    expect(await limit.allow(account)).toBe(false);
  });

  it('counts each account on its own', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await limit.allow({ userId: 'user-1' });
    }

    expect(await limit.allow({ userId: 'user-2' })).toBe(true);
  });

  it('counts an unknown address with the same counter whatever its case or spaces', async () => {
    await limit.allow({ email: 'nobody@example.test' });
    await limit.allow({ email: ' Nobody@Example.test ' });
    await limit.allow({ email: 'NOBODY@example.test' });

    expect(await limit.allow({ email: 'nobody@example.test' })).toBe(false);
  });

  it('never keeps an unknown address in clear: its counter key is a SHA-256 hash', async () => {
    await limit.allow({ email: 'nobody@example.test' });

    const keys = JSON.stringify([...storage.counters.keys()]);
    expect(keys).not.toContain('nobody');
    expect(keys).toMatch(/code-request-account:email:[0-9a-f]{64}/);
  });

  it('keeps an account id and an address apart, even when their text is the same', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await limit.allow({ userId: 'nobody@example.test' });
    }

    expect(await limit.allow({ email: 'nobody@example.test' })).toBe(true);
  });
});
