import type { Request } from 'express';
import { SessionController } from './session.controller';
import type { SessionUserRepository, SessionUser } from './session-user.repository';
import type { SessionUserService } from './session-user.service';

function userWith(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    handle: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    role: 'user',
    status: 'active',
    ...overrides,
  };
}

/** A controller whose session check answers with the given user (or with no user), and whose reason lookup is mocked. */
function controllerFor(user: SessionUser | null, reason: string | null = null) {
  const sessions = {
    check: jest
      .fn()
      .mockResolvedValue(user === null ? { allowed: false, reason: 'anonymous' } : { allowed: true, user }),
  };
  const users = { suspensionReasonOf: jest.fn().mockResolvedValue(reason) };
  const controller = new SessionController(
    sessions as unknown as SessionUserService,
    users as unknown as SessionUserRepository,
  );
  return { controller, users };
}

const REQUEST = { session: { userId: 'user-1' } } as unknown as Request;

describe('SessionController GET /auth/session', () => {
  it('answers null without a session, and reads no reason', async () => {
    const { controller, users } = controllerFor(null);

    expect(await controller.current(REQUEST)).toEqual({ user: null });
    expect(users.suspensionReasonOf).not.toHaveBeenCalled();
  });

  it('sends a null suspension reason for an active account, without reading the reason', async () => {
    const { controller, users } = controllerFor(userWith({ status: 'active' }), 'Ancien motif');

    expect(await controller.current(REQUEST)).toEqual({
      user: { handle: 'alice', displayName: 'Alice', avatarUrl: null, status: 'active', suspensionReason: null },
    });
    expect(users.suspensionReasonOf).not.toHaveBeenCalled();
  });

  it('sends the reason of the suspension for a suspended account', async () => {
    const { controller, users } = controllerFor(userWith({ status: 'suspended' }), 'Spam répété.');

    expect(await controller.current(REQUEST)).toEqual({
      user: { handle: 'alice', displayName: 'Alice', avatarUrl: null, status: 'suspended', suspensionReason: 'Spam répété.' },
    });
    expect(users.suspensionReasonOf).toHaveBeenCalledWith('user-1');
  });

  it('sends a null reason for a suspended account that has none stored', async () => {
    const { controller } = controllerFor(userWith({ status: 'suspended' }), null);

    expect(await controller.current(REQUEST)).toEqual({
      user: { handle: 'alice', displayName: 'Alice', avatarUrl: null, status: 'suspended', suspensionReason: null },
    });
  });

  it('sends a null reason for an account pending deletion, even when a reason is stored', async () => {
    const { controller, users } = controllerFor(userWith({ status: 'pending_deletion' }), 'Motif ancien');

    expect(await controller.current(REQUEST)).toEqual({
      user: { handle: 'alice', displayName: 'Alice', avatarUrl: null, status: 'pending_deletion', suspensionReason: null },
    });
    expect(users.suspensionReasonOf).not.toHaveBeenCalled();
  });
});
