import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** The answer of ThrottlerStorage.increment: the hits of the key, and whether it is blocked. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** What the counting statement returns: the hits of the window, and the seconds until the window ends. */
interface CounterRow {
  readonly hits: number;
  readonly remainingSeconds: number;
}

/**
 * The counters of the auth rate limits, kept in PostgreSQL (table rate_limit_counters, DEC-194). They survive a restart
 * and are shared by every instance of the API. Each key counts in a fixed window that starts at its first hit.
 */
@Injectable()
export class PostgresRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Counts one hit of the key, and tells whether the key is over its limit (more than `limit` hits in the window).
   * `ttl` is the window length in milliseconds. A window that has ended restarts at 1 in the same statement that
   * counts the hit, so no window is counted twice, even by two instances at once. The seconds left are computed by
   * the database clock, so instances with different clocks agree. A block lasts until the window ends: both callers
   * pass the window length as the block duration, so the block duration is not needed here.
   */
  async increment(key: string, ttl: number, limit: number): Promise<ThrottlerStorageRecord> {
    const windowLength = Prisma.sql`(${ttl}::bigint * interval '1 millisecond')`;
    const [row] = await this.prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "rate_limit_counters" ("key", "window_start", "hits")
      VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "window_start" = CASE
          WHEN "rate_limit_counters"."window_start" + ${windowLength} <= now() THEN now()
          ELSE "rate_limit_counters"."window_start"
        END,
        "hits" = CASE
          WHEN "rate_limit_counters"."window_start" + ${windowLength} <= now() THEN 1
          ELSE "rate_limit_counters"."hits" + 1
        END
      RETURNING "hits", CEIL(EXTRACT(EPOCH FROM ("window_start" + ${windowLength} - now())))::integer AS "remainingSeconds"
    `;

    const isBlocked = row.hits > limit;
    return {
      totalHits: row.hits,
      timeToExpire: row.remainingSeconds,
      isBlocked,
      timeToBlockExpire: isBlocked ? row.remainingSeconds : 0,
    };
  }
}
