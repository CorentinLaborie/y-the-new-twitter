import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionUserService } from '../auth/session/session-user.service';
import { ADMIN_IDLE_TIMEOUT_MS, ADMIN_MAX_SESSION_MS } from './admin-session';
import { AdminGuard } from './admin.guard';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const ADMIN = { id: 'admin-1', handle: 'corentin', displayName: 'Corentin', role: 'admin', status: 'active' };

describe('AdminGuard', () => {
  let sessions: { check: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: AdminGuard;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    sessions = { check: jest.fn().mockResolvedValue({ allowed: true, user: ADMIN }) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    guard = new AdminGuard(reflector as unknown as Reflector, sessions as unknown as SessionUserService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function contextWith(session: Record<string, unknown>): {
    context: ExecutionContext;
    request: { session: Record<string, unknown>; sessionUser?: unknown };
  } {
    const request: { session: Record<string, unknown>; sessionUser?: unknown } = { session };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    return { context, request };
  }

  function elevation(verifiedAt: Date, lastSeenAt: Date) {
    return { verifiedAt: verifiedAt.toISOString(), lastSeenAt: lastSeenAt.toISOString() };
  }

  it('answers 404 to anyone who is not an active administrator, so the back-office stays hidden (DEC-037)', async () => {
    sessions.check.mockResolvedValue({ allowed: false, reason: 'role' });
    const { context } = contextWith({ userId: 'user-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    expect(sessions.check).toHaveBeenCalledWith(expect.anything(), {
      statuses: ['active'],
      roles: ['admin'],
    });
  });

  it('answers 404 to an anonymous visitor', async () => {
    sessions.check.mockResolvedValue({ allowed: false, reason: 'anonymous' });
    const { context } = contextWith({});

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('answers 401 to an administrator without an elevation (second factor not given)', async () => {
    const { context } = contextWith({ userId: 'admin-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('answers 401 and drops the elevation after 30 minutes without a request', async () => {
    const { context, request } = contextWith({
      userId: 'admin-1',
      admin: elevation(NOW, new Date(NOW.getTime() - ADMIN_IDLE_TIMEOUT_MS - 1)),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(request.session.admin).toBeUndefined();
  });

  it('answers 401 after 8 hours from the login, even when the session is active', async () => {
    const { context } = contextWith({
      userId: 'admin-1',
      admin: elevation(new Date(NOW.getTime() - ADMIN_MAX_SESSION_MS - 1), NOW),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('lets an elevated administrator through and restarts the 30-minute idle timer', async () => {
    const verifiedAt = new Date(NOW.getTime() - 60_000);
    const { context, request } = contextWith({
      userId: 'admin-1',
      admin: elevation(verifiedAt, new Date(NOW.getTime() - 60_000)),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sessionUser).toEqual(ADMIN);
    expect(request.session.admin).toEqual({
      verifiedAt: verifiedAt.toISOString(),
      lastSeenAt: NOW.toISOString(),
    });
  });

  it('skips the elevation check on a route that does not need it (the second-factor set-up)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context, request } = contextWith({ userId: 'admin-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.sessionUser).toEqual(ADMIN);
  });
});
