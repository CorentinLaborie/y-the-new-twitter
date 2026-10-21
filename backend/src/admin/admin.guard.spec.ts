import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionUserService } from '../auth/session/session-user.service';
import { ADMIN_IDLE_TIMEOUT_MS, ADMIN_MAX_SESSION_MS, ADMIN_REAUTH_WINDOW_MS } from './admin-session';
import { ADMIN_REAUTH_KEY } from './admin.decorators';
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
    // Elevation is required by default; a re-authentication is not, unless a test asks for it.
    reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => key !== ADMIN_REAUTH_KEY),
    };
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

  describe('re-authentication (DEC-088)', () => {
    /** The elevation is current; the route asks for a re-authentication or not, as the test says. */
    function routeNeedsReauth(required: boolean): void {
      reflector.getAllAndOverride.mockImplementation((key: string) =>
        key === ADMIN_REAUTH_KEY ? required : true,
      );
    }

    const current = elevation(NOW, NOW);

    it('answers 403 reauth_required when the route needs a re-authentication and there is none', async () => {
      routeNeedsReauth(true);
      const { context } = contextWith({ userId: 'admin-1', admin: current });

      const failure = await guard.canActivate(context).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ForbiddenException);
      expect((failure as ForbiddenException).getResponse()).toEqual({
        message: 'Ré-authentification requise.',
        code: 'reauth_required',
      });
    });

    it('answers 403 once the re-authentication is older than 10 minutes', async () => {
      routeNeedsReauth(true);
      const { context } = contextWith({
        userId: 'admin-1',
        admin: current,
        reauth_at: new Date(NOW.getTime() - ADMIN_REAUTH_WINDOW_MS - 1).toISOString(),
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('lets the route through with a re-authentication of less than 10 minutes, and keeps the elevation', async () => {
      routeNeedsReauth(true);
      const { context, request } = contextWith({
        userId: 'admin-1',
        admin: current,
        reauth_at: new Date(NOW.getTime() - ADMIN_REAUTH_WINDOW_MS + 1000).toISOString(),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.session.admin).toEqual({ ...current, lastSeenAt: NOW.toISOString() });
    });

    it('answers 403 when the route needs a re-authentication but not an elevation, and none is current', async () => {
      reflector.getAllAndOverride.mockImplementation((key: string) => key === ADMIN_REAUTH_KEY);
      const { context } = contextWith({ userId: 'admin-1' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('lets the route through without an elevation when the re-authentication is current', async () => {
      reflector.getAllAndOverride.mockImplementation((key: string) => key === ADMIN_REAUTH_KEY);
      const { context } = contextWith({ userId: 'admin-1', reauth_at: NOW.toISOString() });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('does not ask for a re-authentication on a route that does not need one', async () => {
      routeNeedsReauth(false);
      const { context } = contextWith({ userId: 'admin-1', admin: current });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('answers 401, not 403, when the elevation is missing even if a re-authentication is current', async () => {
      routeNeedsReauth(true);
      const { context } = contextWith({
        userId: 'admin-1',
        reauth_at: NOW.toISOString(),
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
