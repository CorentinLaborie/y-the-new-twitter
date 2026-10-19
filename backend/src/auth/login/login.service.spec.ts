import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { User } from '../../database/generated/client/client';
import type { UsersRepository } from '../../users/users.repository';
import { hashPassword } from '../password';
import type { LoginAttemptsRepository } from './login-attempts.repository';
import { LOCK_DURATION_MS, LoginService, MAX_FAILED_LOGINS } from './login.service';

const PASSWORD = 'Abcdef1!';
const IP = '203.0.113.7';
const IP_KEY = 'unit-ip-key';

describe('LoginService', () => {
  let stored: string;
  let users: { findByEmail: jest.Mock };
  let attempts: {
    recordEvent: jest.Mock;
    countFailure: jest.Mock;
    countFailuresSince: jest.Mock;
    lastSuccessAt: jest.Mock;
    lockUntil: jest.Mock;
    clearAfterSuccess: jest.Mock;
  };
  let service: LoginService;

  beforeAll(async () => {
    stored = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    users = { findByEmail: jest.fn() };
    attempts = {
      recordEvent: jest.fn().mockResolvedValue(undefined),
      countFailure: jest.fn().mockResolvedValue(undefined),
      countFailuresSince: jest.fn().mockResolvedValue(1),
      lastSuccessAt: jest.fn().mockResolvedValue(null),
      lockUntil: jest.fn().mockResolvedValue(undefined),
      clearAfterSuccess: jest.fn().mockResolvedValue(true),
    };
    const config = { getOrThrow: jest.fn().mockReturnValue(IP_KEY) };
    service = new LoginService(
      config as unknown as ConfigService,
      users as unknown as UsersRepository,
      attempts as unknown as LoginAttemptsRepository,
    );
  });

  function account(overrides: Partial<User> = {}): User {
    return {
      id: 'user-1',
      handle: 'alice',
      displayName: 'Alice',
      email: 'alice@example.test',
      passwordHash: stored,
      status: 'active',
      role: 'user',
      lockedUntil: null,
      failedLoginCount: 0,
      ...overrides,
    } as User;
  }

  function attempt(password = PASSWORD, userAgent: string | undefined = 'Mozilla/5.0 test') {
    return { email: 'alice@example.test', password, ipAddress: IP, userAgent };
  }

  it('answers invalid for an unknown address, and records the failure without a user', async () => {
    users.findByEmail.mockResolvedValue(null);

    const outcome = await service.login(attempt());

    expect(outcome).toEqual({ status: 'invalid' });
    expect(attempts.countFailuresSince).not.toHaveBeenCalled();
    expect(attempts.recordEvent).toHaveBeenCalledWith({
      userId: null,
      result: 'failure',
      ipHash: createHmac('sha256', IP_KEY).update(IP).digest('hex'),
      userAgent: 'Mozilla/5.0 test',
    });
  });

  it('never stores the raw IP address, and cuts the user agent to 255 characters', async () => {
    users.findByEmail.mockResolvedValue(null);

    await service.login(attempt(PASSWORD, 'u'.repeat(300)));

    const event = attempts.recordEvent.mock.calls[0][0] as { ipHash: string; userAgent: string };
    expect(event.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(event.ipHash).not.toContain(IP);
    expect(event.userAgent).toHaveLength(255);
  });

  it('counts a wrong password on the account and answers invalid', async () => {
    users.findByEmail.mockResolvedValue(account());

    const outcome = await service.login(attempt('Abcdef1?'));

    expect(outcome).toEqual({ status: 'invalid' });
    expect(attempts.countFailuresSince).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(attempts.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', result: 'failure' }),
    );
  });

  it('answers the fifth failure with invalid (401) and locks the account for 15 minutes', async () => {
    users.findByEmail.mockResolvedValue(account());
    attempts.countFailuresSince.mockResolvedValue(MAX_FAILED_LOGINS);
    const before = Date.now();

    const outcome = await service.login(attempt('Abcdef1?'));

    expect(outcome).toEqual({ status: 'invalid' });
    const lockedUntil = attempts.lockUntil.mock.calls[0][1] as Date;
    expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before + LOCK_DURATION_MS);
    expect(lockedUntil.getTime()).toBeLessThanOrEqual(Date.now() + LOCK_DURATION_MS);
  });

  it('counts from the end of an expired lock, so one failure after it does not lock again', async () => {
    const lockedUntil = new Date(Date.now() - 60_000);
    users.findByEmail.mockResolvedValue(account({ lockedUntil }));

    await service.login(attempt('Abcdef1?'));

    expect(attempts.countFailuresSince).toHaveBeenCalledWith('user-1', lockedUntil);
  });

  it('does not count the failures that came before the last successful login', async () => {
    const lastSuccess = new Date(Date.now() - 60_000);
    users.findByEmail.mockResolvedValue(account());
    attempts.lastSuccessAt.mockResolvedValue(lastSuccess);

    await service.login(attempt('Abcdef1?'));

    expect(attempts.countFailuresSince).toHaveBeenCalledWith('user-1', lastSuccess);
  });

  it('refuses a locked account without checking the password or counting', async () => {
    users.findByEmail.mockResolvedValue(account({ lockedUntil: new Date(Date.now() + 120_000) }));

    const outcome = await service.login(attempt());

    expect(outcome.status).toBe('locked');
    expect(attempts.clearAfterSuccess).not.toHaveBeenCalled();
    expect(attempts.countFailuresSince).not.toHaveBeenCalled();
    expect(attempts.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failure' }));
  });

  it('answers unverified for a pending account with the right password, without counting', async () => {
    users.findByEmail.mockResolvedValue(account({ status: 'pending_verification' }));

    const outcome = await service.login(attempt());

    expect(outcome).toEqual({ status: 'unverified' });
    expect(attempts.countFailuresSince).not.toHaveBeenCalled();
    expect(attempts.clearAfterSuccess).not.toHaveBeenCalled();
  });

  it('answers invalid for a deleted account, as for an unknown address', async () => {
    users.findByEmail.mockResolvedValue(account({ status: 'deleted' }));

    const outcome = await service.login(attempt());

    expect(outcome).toEqual({ status: 'invalid' });
    expect(attempts.countFailuresSince).not.toHaveBeenCalled();
  });

  it('answers success with the user, clears the counter and records a success', async () => {
    users.findByEmail.mockResolvedValue(account());

    const outcome = await service.login(attempt());

    expect(outcome).toEqual({
      status: 'success',
      user: { id: 'user-1', handle: 'alice', displayName: 'Alice', role: 'user', status: 'active' },
    });
    expect(attempts.clearAfterSuccess).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(attempts.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', result: 'success' }),
    );
  });

  it('answers locked when a concurrent failure locked the account during the check', async () => {
    users.findByEmail.mockResolvedValue(account());
    attempts.clearAfterSuccess.mockResolvedValue(false);

    const outcome = await service.login(attempt());

    expect(outcome).toEqual({ status: 'locked', retryAfterSeconds: LOCK_DURATION_MS / 1000 });
    expect(attempts.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ result: 'failure' }));
  });
});
