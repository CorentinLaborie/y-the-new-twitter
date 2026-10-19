import { SessionUserService } from './session-user.service';
import type { SessionUser } from './session-user.repository';

function userWith(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    handle: 'alice',
    displayName: 'Alice',
    role: 'user',
    status: 'active',
    ...overrides,
  };
}

function serviceFor(user: SessionUser | null) {
  const users = { findById: jest.fn().mockResolvedValue(user) };
  return { service: new SessionUserService(users as never), users };
}

describe('SessionUserService', () => {
  it('refuses a session without a user ID, without looking anything up', async () => {
    const { service, users } = serviceFor(null);

    expect(await service.check({}, { statuses: ['active'] })).toEqual({
      allowed: false,
      reason: 'anonymous',
    });
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('refuses a session whose account no longer exists or is deleted', async () => {
    const { service } = serviceFor(null);

    expect(await service.check({ userId: 'gone' }, { statuses: ['active'] })).toEqual({
      allowed: false,
      reason: 'anonymous',
    });
  });

  it('refuses a status the route does not accept, and says which one', async () => {
    const { service } = serviceFor(userWith({ status: 'suspended' }));

    expect(await service.check({ userId: 'user-1' }, { statuses: ['active'] })).toEqual({
      allowed: false,
      reason: 'status',
      status: 'suspended',
    });
  });

  it('accepts an active account on a route with no role rule', async () => {
    const { service } = serviceFor(userWith({}));

    const decision = await service.check({ userId: 'user-1' }, { statuses: ['active'] });

    expect(decision).toEqual({ allowed: true, user: userWith({}) });
  });

  it('lets an administrator through a route that requires the admin role', async () => {
    const { service } = serviceFor(userWith({ role: 'admin' }));

    const decision = await service.check({ userId: 'user-1' }, { statuses: ['active'], roles: ['admin'] });

    expect(decision.allowed).toBe(true);
  });

  it('refuses an ordinary user on a route that requires the admin role', async () => {
    const { service } = serviceFor(userWith({ role: 'user' }));

    expect(await service.check({ userId: 'user-1' }, { statuses: ['active'], roles: ['admin'] })).toEqual({
      allowed: false,
      reason: 'role',
    });
  });

  it('refuses an administrator whose account is suspended: the role does not bypass the status', async () => {
    const { service } = serviceFor(userWith({ role: 'admin', status: 'suspended' }));

    expect(await service.check({ userId: 'user-1' }, { statuses: ['active'], roles: ['admin'] })).toEqual({
      allowed: false,
      reason: 'status',
      status: 'suspended',
    });
  });
});
