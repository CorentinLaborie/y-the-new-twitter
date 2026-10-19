import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AUTH_RATE_LIMIT_METADATA, AuthRateLimitPolicy } from './auth-rate-limit.policies';

/**
 * Limits the requests of one IP address to the endpoint, with the policy of section 9.4.
 * Usage: `@AuthRateLimit('login')` on a controller method. The module RateLimitModule must be imported.
 */
export function AuthRateLimit(policy: AuthRateLimitPolicy): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(AUTH_RATE_LIMIT_METADATA, policy), UseGuards(AuthRateLimitGuard));
}
