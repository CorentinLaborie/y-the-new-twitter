import type { SessionUser } from '../auth/session/session-user.repository';
import { ProfileController } from './profile.controller';
import type { ProfileService } from './profile.service';

describe('ProfileController (plan L1, 1.3)', () => {
  it('passes the signed-in viewer and the body to the service and returns its profile', async () => {
    const viewer = { id: 'user-1', handle: 'alice' } as SessionUser;
    const profile = { handle: 'alice', displayName: 'Alice Martin', bio: null };
    const service = { update: jest.fn().mockResolvedValue(profile) };
    const controller = new ProfileController(service as unknown as ProfileService);

    const result = await controller.update(viewer, { displayName: 'Alice Martin' });

    expect(service.update).toHaveBeenCalledWith(viewer, { displayName: 'Alice Martin' });
    expect(result).toBe(profile);
  });
});
