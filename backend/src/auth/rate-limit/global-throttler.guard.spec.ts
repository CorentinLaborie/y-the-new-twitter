import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorage, type ThrottlerRequest } from '@nestjs/throttler';
import { GlobalThrottlerGuard, RATE_LIMIT_ERROR_HEADER, STORE_UNAVAILABLE } from './global-throttler.guard';

const THROTTLER = { name: 'default', ttl: 60_000, limit: 120 };

async function setup(increment: jest.Mock) {
  const storage = { increment } as unknown as ThrottlerStorage;
  const guard = new GlobalThrottlerGuard([THROTTLER], storage, new Reflector());
  await guard.onModuleInit();
  const res = { setHeader: jest.fn() };
  const context = {
    getType: () => 'http',
    getClass: () => ({ name: 'AppController' }),
    getHandler: () => ({ name: 'getStatus' }),
    switchToHttp: () => ({ getRequest: () => ({ ip: '203.0.113.5', headers: {} }), getResponse: () => res }),
  } as unknown as ExecutionContext;
  const props: ThrottlerRequest = {
    context,
    limit: 120,
    ttl: 60_000,
    throttler: THROTTLER,
    blockDuration: 60_000,
    getTracker: async () => '203.0.113.5',
    generateKey: (_context, tracker, name) => `${name}:${tracker}`,
  };

  return { guard, res, props };
}

describe('GlobalThrottlerGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves a request under the limit, with no error header', async () => {
    const increment = jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
    const { guard, res, props } = await setup(increment);

    await expect(guard['handleRequest'](props)).resolves.toBe(true);

    expect(res.setHeader).not.toHaveBeenCalledWith(RATE_LIMIT_ERROR_HEADER, expect.anything());
    expect(increment).toHaveBeenCalledWith('default:203.0.113.5', 60_000, 120, 60_000, 'default');
  });

  it('refuses a request over the limit with the throttling exception', async () => {
    const increment = jest.fn().mockResolvedValue({ totalHits: 121, timeToExpire: 30, isBlocked: true, timeToBlockExpire: 30 });
    const { guard, res, props } = await setup(increment);

    await expect(guard['handleRequest'](props)).rejects.toBeInstanceOf(ThrottlerException);
    expect(res.setHeader).not.toHaveBeenCalledWith(RATE_LIMIT_ERROR_HEADER, expect.anything());
  });

  it('serves the request when the counter store is down, says why in a header, and logs the error', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const increment = jest.fn().mockRejectedValue(new Error('connection refused'));
    const { guard, res, props } = await setup(increment);

    await expect(guard['handleRequest'](props)).resolves.toBe(true);

    expect(res.setHeader).toHaveBeenCalledWith(RATE_LIMIT_ERROR_HEADER, STORE_UNAVAILABLE);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('counter store is unavailable'), expect.any(String));
  });
});
