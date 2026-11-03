import { Prisma } from '../../database/generated/client/client';
import type { PrismaService } from '../../database/prisma.service';
import { PostgresRateLimitStorage } from './postgres-rate-limit.storage';

const MINUTE_MS = 60 * 1000;
const WINDOW_MS = 15 * MINUTE_MS;

/**
 * The store with the database mocked: the counting statement is one query that returns the hits of the window and
 * the seconds left. The window reset itself happens in that statement, so these tests cover what the store does
 * with the answer and the statement it sends. The reset against a real database is not tested in this file.
 */
describe('PostgresRateLimitStorage (section 9.4, DEC-194)', () => {
  let queryRaw: jest.Mock;
  let storage: PostgresRateLimitStorage;

  beforeEach(() => {
    queryRaw = jest.fn();
    storage = new PostgresRateLimitStorage({ $queryRaw: queryRaw } as unknown as PrismaService);
  });

  /** The statement sent to the database, with its parameters, rendered the way Prisma renders it. */
  function sentStatement(): Prisma.Sql {
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    return Prisma.sql(strings, ...values);
  }

  it('counts a hit in the window and returns the hits of the window', async () => {
    queryRaw.mockResolvedValue([{ hits: 2, remainingSeconds: 600 }]);

    await expect(storage.increment('login:203.0.113.7', WINDOW_MS, 20)).resolves.toEqual({
      totalHits: 2,
      timeToExpire: 600,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('starts a new window at 1 hit, with the whole window left', async () => {
    queryRaw.mockResolvedValue([{ hits: 1, remainingSeconds: 900 }]);

    await expect(storage.increment('login:203.0.113.7', WINDOW_MS, 20)).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 900,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('does not block the hit that reaches the limit, and blocks the next one', async () => {
    queryRaw.mockResolvedValueOnce([{ hits: 3, remainingSeconds: 500 }]);
    queryRaw.mockResolvedValueOnce([{ hits: 4, remainingSeconds: 499 }]);

    const atLimit = await storage.increment('code-request-account:id:user-1', WINDOW_MS, 3);
    const overLimit = await storage.increment('code-request-account:id:user-1', WINDOW_MS, 3);

    expect(atLimit.isBlocked).toBe(false);
    expect(overLimit.isBlocked).toBe(true);
  });

  it('gives the seconds until the window ends as the block time, for Retry-After', async () => {
    queryRaw.mockResolvedValue([{ hits: 21, remainingSeconds: 754 }]);

    await expect(storage.increment('login:203.0.113.7', WINDOW_MS, 20)).resolves.toEqual({
      totalHits: 21,
      timeToExpire: 754,
      isBlocked: true,
      timeToBlockExpire: 754,
    });
  });

  it('sends the key and the window length, and resets an ended window in the same statement', async () => {
    queryRaw.mockResolvedValue([{ hits: 1, remainingSeconds: 900 }]);

    await storage.increment('login:203.0.113.7', WINDOW_MS, 20);

    const statement = sentStatement();
    expect(statement.values[0]).toBe('login:203.0.113.7');
    expect(statement.values.slice(1)).toEqual([WINDOW_MS, WINDOW_MS, WINDOW_MS]);
    expect(statement.sql).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(statement.sql).toMatch(
      /"window_start" \+ \(\?::bigint \* interval '1 millisecond'\) <= now\(\) THEN now\(\)/,
    );
    expect(statement.sql).toMatch(/THEN 1\s+ELSE "rate_limit_counters"\."hits" \+ 1/);
  });

  it('lets a database error reach the caller', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expect(storage.increment('login:203.0.113.7', WINDOW_MS, 20)).rejects.toThrow(
      'database unavailable',
    );
  });
});
