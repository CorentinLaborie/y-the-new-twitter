import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { AVATAR_MAX_BYTES, AvatarService } from './avatar.service';
import type { AvatarStorage } from './avatar.storage';
import type { UsersRepository } from './users.repository';

const VIEWER = { id: 'user-1', handle: 'alice' } as SessionUser;
const DB = { tag: 'transaction' };

/** Magic bytes that start each accepted format (plan L1, 2.1). */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const GIF = Buffer.from('GIF89a');

function fakes() {
  const users = {
    transaction: jest.fn(async (run: (db: unknown) => Promise<unknown>) => run(DB)),
    lockActiveAccount: jest.fn().mockResolvedValue(true),
    setAvatarUrl: jest.fn().mockResolvedValue(undefined),
    avatarUrlOf: jest.fn().mockResolvedValue(null),
  };
  const storage = {
    save: jest.fn().mockResolvedValue('/avatars/user-1-new.jpg'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AvatarService(users as unknown as UsersRepository, storage as unknown as AvatarStorage);
  return { users, storage, service };
}

describe('AvatarService (plan L1, step 2)', () => {
  describe('upload (2.1, 2.2)', () => {
    it.each([
      ['JPEG', JPEG, '.jpg'],
      ['PNG', PNG, '.png'],
      ['WebP', WEBP, '.webp'],
    ])('stores a %s photo and records its address on the profile', async (_name, bytes, extension) => {
      const { storage, users, service } = fakes();

      const url = await service.upload(VIEWER, bytes);

      expect(storage.save).toHaveBeenCalledWith(bytes, extension);
      expect(users.setAvatarUrl).toHaveBeenCalledWith(DB, 'user-1', '/avatars/user-1-new.jpg');
      expect(url).toBe('/avatars/user-1-new.jpg');
    });

    it('refuses a format other than JPEG, PNG or WebP (422), and stores nothing', async () => {
      const { storage, service } = fakes();

      await expect(service.upload(VIEWER, GIF)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('refuses a file of more than 2 MB (422), and stores nothing', async () => {
      const { storage, service } = fakes();
      const tooLarge = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_BYTES)]);

      await expect(service.upload(VIEWER, tooLarge)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('accepts a file of exactly 2 MB', async () => {
      const { service } = fakes();
      const exact = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_BYTES - JPEG.length)]);

      await expect(service.upload(VIEWER, exact)).resolves.toBe('/avatars/user-1-new.jpg');
    });

    it('refuses an account that is not active (403), and stores nothing (R13)', async () => {
      const { storage, users, service } = fakes();
      users.lockActiveAccount.mockResolvedValue(false);

      await expect(service.upload(VIEWER, JPEG)).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('removes the previous photo file once the new one is recorded', async () => {
      const { storage, users, service } = fakes();
      users.avatarUrlOf.mockResolvedValue('/avatars/user-1-old.jpg');

      await service.upload(VIEWER, PNG);

      expect(storage.remove).toHaveBeenCalledWith('/avatars/user-1-old.jpg');
    });
  });

  describe('removal (2.3)', () => {
    it('clears the address and deletes the file, back to the default photo', async () => {
      const { storage, users, service } = fakes();
      users.avatarUrlOf.mockResolvedValue('/avatars/user-1-old.jpg');

      await service.remove(VIEWER);

      expect(users.setAvatarUrl).toHaveBeenCalledWith(DB, 'user-1', null);
      expect(storage.remove).toHaveBeenCalledWith('/avatars/user-1-old.jpg');
    });

    it('does nothing to the file when there is no photo', async () => {
      const { storage, service } = fakes();

      await service.remove(VIEWER);

      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('refuses an account that is not active (403)', async () => {
      const { users, service } = fakes();
      users.lockActiveAccount.mockResolvedValue(false);

      await expect(service.remove(VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
