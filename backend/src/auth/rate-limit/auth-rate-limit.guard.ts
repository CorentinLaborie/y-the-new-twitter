import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AUTH_RATE_LIMIT_METADATA, AUTH_RATE_LIMIT_POLICIES, AuthRateLimitPolicy } from './auth-rate-limit.policies';
import { RATE_LIMIT_STORAGE } from './rate-limit.module';

/**
 * Applies the policy stored by the AuthRateLimit decorator to the current IP address.
 * Above the limit it answers 429 with a Retry-After header, in seconds, until the block ends.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORAGE) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AuthRateLimitPolicy | undefined>(AUTH_RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy === undefined) {
      return true;
    }

    const { limit, windowMs } = AUTH_RATE_LIMIT_POLICIES[policy];
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // The block lasts one window, the same as the counting period.
    const record = await this.storage.increment(`${policy}:${request.ip}`, windowMs, limit, windowMs, policy);
    if (!record.isBlocked) {
      return true;
    }

    response.setHeader('Retry-After', String(Math.max(1, record.timeToBlockExpire)));
    throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
