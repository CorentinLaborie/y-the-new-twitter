import { Global, Module } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';

/** Counters of the auth rate limits, in memory (DEC-141). One instance per application. */
export const RATE_LIMIT_STORAGE = Symbol('RATE_LIMIT_STORAGE');

/** Global, so any controller can use the AuthRateLimit decorator without importing this module. */
@Global()
@Module({
  providers: [{ provide: RATE_LIMIT_STORAGE, useClass: ThrottlerStorageService }],
  exports: [RATE_LIMIT_STORAGE],
})
export class RateLimitModule {}
