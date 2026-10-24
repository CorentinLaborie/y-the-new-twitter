import { NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { AccountSettingsService } from './account-settings.service';
import type { UsersRepository } from './users.repository';

const VIEWER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice Martin',
  role: 'user',
  status: 'active',
};

describe('AccountSettingsService (L5, step 2)', () => {
  it('returns the e-mail, the status and no purge date outside a deletion', async () => {
    const users = {
      findAccountSettings: jest.fn().mockResolvedValue({
        handle: 'alice',
        displayName: 'Alice Martin',
        email: 'alice@example.test',
        status: 'active',
        deletionPurgeAt: null,
      }),
    };
    const service = new AccountSettingsService(users as unknown as UsersRepository);

    await expect(service.read(VIEWER)).resolves.toEqual({
      handle: 'alice',
      displayName: 'Alice Martin',
      email: 'alice@example.test',
      status: 'active',
      deletionPurgeAt: null,
    });
    expect(users.findAccountSettings).toHaveBeenCalledWith('user-1');
  });

  it('returns the purge date of a pending deletion', async () => {
    const purgeAt = new Date('2027-01-21T10:00:00.000Z');
    const users = {
      findAccountSettings: jest.fn().mockResolvedValue({
        handle: 'alice',
        displayName: 'Alice Martin',
        email: 'alice@example.test',
        status: 'pending_deletion',
        deletionPurgeAt: purgeAt,
      }),
    };
    const service = new AccountSettingsService(users as unknown as UsersRepository);

    await expect(service.read(VIEWER)).resolves.toMatchObject({ deletionPurgeAt: purgeAt });
  });

  it('answers a missing account as not found (404)', async () => {
    const users = { findAccountSettings: jest.fn().mockResolvedValue(null) };
    const service = new AccountSettingsService(users as unknown as UsersRepository);

    await expect(service.read(VIEWER)).rejects.toThrow(NotFoundException);
  });
});
