import type { SessionUser } from '../auth/session/session-user.repository';
import { AvatarController } from './avatar.controller';
import type { AvatarService } from './avatar.service';

const VIEWER = { id: 'user-1', handle: 'alice' } as SessionUser;

describe('AvatarController (plan L1, 2.1 and 2.3)', () => {
  it('passes the raw photo bytes to the service and returns the new address', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const service = { upload: jest.fn().mockResolvedValue('/avatars/new.jpg') };
    const controller = new AvatarController(service as unknown as AvatarService);

    const result = await controller.upload(VIEWER, bytes);

    expect(service.upload).toHaveBeenCalledWith(VIEWER, bytes);
    expect(result).toEqual({ avatarUrl: '/avatars/new.jpg' });
  });

  it('refuses a body that is not raw bytes by sending the service an empty photo, which it refuses (422)', async () => {
    const service = { upload: jest.fn().mockResolvedValue('unused') };
    const controller = new AvatarController(service as unknown as AvatarService);

    await controller.upload(VIEWER, { not: 'bytes' });

    expect(service.upload).toHaveBeenCalledWith(VIEWER, Buffer.alloc(0));
  });

  it('removes the photo through the service', async () => {
    const service = { remove: jest.fn().mockResolvedValue(undefined) };
    const controller = new AvatarController(service as unknown as AvatarService);

    await controller.remove(VIEWER);

    expect(service.remove).toHaveBeenCalledWith(VIEWER);
  });
});
