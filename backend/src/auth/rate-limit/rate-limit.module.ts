import { Global, Module } from '@nestjs/common';
import { PostgresRateLimitStorage } from './postgres-rate-limit.storage';

/** Counters of the auth rate limits, kept in PostgreSQL (DEC-194). Shared by every instance of the API. */
export const RATE_LIMIT_STORAGE = Symbol('RATE_LIMIT_STORAGE');

/** Global, so any controller can use the AuthRateLimit decorator without importing this module. */
@Global()
@Module({
  providers: [{ provide: RATE_LIMIT_STORAGE, useClass: PostgresRateLimitStorage }],
  exports: [RATE_LIMIT_STORAGE],
})
export class RateLimitModule {}
