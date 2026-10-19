import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { AuthRateLimit } from './auth-rate-limit.decorator';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AUTH_RATE_LIMIT_POLICIES } from './auth-rate-limit.policies';

class ProbeController {
  @AuthRateLimit('login')
  login(): void {}

  @AuthRateLimit('code-request')
  requestCode(): void {}

  @AuthRateLimit('code-request')
  resendCode(): void {}

  open(): void {}
}

const RECORD_FREE = { totalHits: 1, timeToExpire: 900, isBlocked: false, timeToBlockExpire: 0 };

function contextFor(handler: keyof ProbeController, ip: string) {
  const response = { setHeader: jest.fn() };
  const request = { ip };
  const context = {
    getHandler: () => ProbeController.prototype[handler],
    getClass: () => ProbeController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;

  return { context, response };
}

describe('AuthRateLimitGuard', () => {
  let storage: { increment: jest.Mock };
  let guard: AuthRateLimitGuard;

  beforeEach(() => {
    storage = { increment: jest.fn().mockResolvedValue(RECORD_FREE) };
    guard = new AuthRateLimitGuard(new Reflector(), storage as unknown as ThrottlerStorage);
  });

  it('lets the request through and counts it under the policy and the IP', async () => {
    const { context } = contextFor('login', '203.0.113.7');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const { windowMs, limit } = AUTH_RATE_LIMIT_POLICIES.login;
    expect(storage.increment).toHaveBeenCalledWith('login:203.0.113.7', windowMs, limit, windowMs, 'login');
  });

  it('answers 429 with Retry-After in seconds while the IP is blocked', async () => {
    storage.increment.mockResolvedValue({ totalHits: 21, timeToExpire: 900, isBlocked: true, timeToBlockExpire: 754 });
    const { context, response } = contextFor('login', '203.0.113.7');

    const outcome = guard.canActivate(context);

    await expect(outcome).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    await expect(outcome).rejects.toBeInstanceOf(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '754');
  });

  it('sends at least one second in Retry-After', async () => {
    storage.increment.mockResolvedValue({ totalHits: 11, timeToExpire: 3600, isBlocked: true, timeToBlockExpire: 0 });
    const { context, response } = contextFor('requestCode', '203.0.113.7');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('does not touch the counters of a route without the decorator', async () => {
    const { context } = contextFor('open', '203.0.113.7');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(storage.increment).not.toHaveBeenCalled();
  });

  it('shares one counter between the endpoints of the same policy, and keeps IPs apart', async () => {
    await guard.canActivate(contextFor('requestCode', '203.0.113.7').context);
    await guard.canActivate(contextFor('resendCode', '203.0.113.7').context);
    await guard.canActivate(contextFor('requestCode', '198.51.100.2').context);

    const keys = storage.increment.mock.calls.map(([key]) => key);
    expect(keys).toEqual(['code-request:203.0.113.7', 'code-request:203.0.113.7', 'code-request:198.51.100.2']);
  });

  it.each([
    ['login', 20, 15 * 60 * 1000],
    ['signup', 5, 60 * 60 * 1000],
    ['code-confirm', 20, 60 * 60 * 1000],
    ['code-request', 10, 60 * 60 * 1000],
  ] as const)('uses the section 9.4 values for %s: %i attempts per window', (policy, limit, windowMs) => {
    expect(AUTH_RATE_LIMIT_POLICIES[policy]).toEqual({ limit, windowMs });
  });
});
