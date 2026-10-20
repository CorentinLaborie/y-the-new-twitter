import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY, ROLES_KEY, STATUSES_KEY } from './access.decorators';
import { SessionGuard } from './session.guard';
import { SessionUserService } from './session-user.service';

/** A handler with the given metadata, as the decorators set it. */
function contextWith(metadata: Record<string, unknown>, request: Record<string, unknown> = {}) {
  const handler = function handler() {};
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  const req = { session: { userId: 'user-1' }, ...request };
  const context = {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;

  return { context, req };
}

function guardWith(decision: unknown) {
  const sessions = { check: jest.fn().mockResolvedValue(decision) };
  return { guard: new SessionGuard(new Reflector(), sessions as unknown as SessionUserService), sessions };
}

describe('SessionGuard', () => {
  it('lets a @Public route through without looking at the session', async () => {
    const { guard, sessions } = guardWith({ allowed: false, reason: 'anonymous' });

    expect(await guard.canActivate(contextWith({ [PUBLIC_KEY]: true }).context)).toBe(true);
    expect(sessions.check).not.toHaveBeenCalled();
  });

  it('answers 401 when the decision is anonymous', async () => {
    const { guard } = guardWith({ allowed: false, reason: 'anonymous' });

    await expect(guard.canActivate(contextWith({}).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 403 with the reason in French when the status is not accepted', async () => {
    const { guard } = guardWith({ allowed: false, reason: 'status', status: 'suspended' });

    await expect(guard.canActivate(contextWith({}).context)).rejects.toThrow('Votre compte est suspendu.');
  });

  it.each([
    [
      'pending_verification',
      'Votre adresse e-mail n’est pas encore vérifiée.',
      'account_pending_verification',
    ],
    ['suspended', 'Votre compte est suspendu.', 'account_suspended'],
    ['pending_deletion', 'Votre compte est en attente de suppression.', 'account_pending_deletion'],
  ] as const)(
    'answers 403 with the French message and the code of the %s status',
    async (status, message, code) => {
      const { guard } = guardWith({ allowed: false, reason: 'status', status });

      const error = await guard.canActivate(contextWith({}).context).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({ message, code });
    },
  );

  it('answers 403 when the role is not accepted', async () => {
    const { guard } = guardWith({ allowed: false, reason: 'role' });

    await expect(guard.canActivate(contextWith({}).context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the route rules to the decision service, with active as the default status', async () => {
    const { guard, sessions } = guardWith({ allowed: false, reason: 'anonymous' });

    await guard.canActivate(contextWith({}).context).catch(() => undefined);

    expect(sessions.check).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { statuses: ['active'], roles: undefined },
    );
  });

  it('uses the statuses and roles declared on the route', async () => {
    const { guard, sessions } = guardWith({ allowed: false, reason: 'anonymous' });

    await guard
      .canActivate(contextWith({ [STATUSES_KEY]: ['active', 'suspended'], [ROLES_KEY]: ['admin'] }).context)
      .catch(() => undefined);

    expect(sessions.check).toHaveBeenCalledWith(expect.anything(), {
      statuses: ['active', 'suspended'],
      roles: ['admin'],
    });
  });

  it('stores the allowed user on the request for @CurrentUser', async () => {
    const user = { id: 'user-1', handle: 'alice', displayName: 'Alice', role: 'admin', status: 'active' };
    const { guard } = guardWith({ allowed: true, user });
    const { context, req } = contextWith({});

    expect(await guard.canActivate(context)).toBe(true);
    expect((req as { sessionUser?: unknown }).sessionUser).toEqual(user);
  });
});
