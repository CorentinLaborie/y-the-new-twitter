import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { hashPassword } from '../password';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AccountDeletionService, DELETION_WINDOW_MS } from './account-deletion.service';

const PASSWORD = 'Abcdef1!';
const NOW = new Date('2026-10-21T10:00:00.000Z');

describe('AccountDeletionService (R16)', () => {
  let storedHash: string;
  let accounts: { findAccount: jest.Mock; startDeletion: jest.Mock };
  let service: AccountDeletionService;

  beforeAll(async () => {
    storedHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    accounts = {
      findAccount: jest.fn().mockResolvedValue({ passwordHash: storedHash, status: 'active' }),
      startDeletion: jest.fn().mockResolvedValue(true),
    };
    service = new AccountDeletionService(accounts as unknown as AccountDeletionRepository);
  });

  it('starts the window for the current password, with the purge 90 days later', async () => {
    await service.requestDeletion('user-1', PASSWORD, NOW);

    expect(DELETION_WINDOW_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(accounts.startDeletion).toHaveBeenCalledWith(
      'user-1',
      NOW,
      new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
    );
  });

  it('refuses a wrong password with 422, and changes nothing', async () => {
    await expect(service.requestDeletion('user-1', 'Abcdef1?', NOW)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(accounts.startDeletion).not.toHaveBeenCalled();
  });

  it('refuses an account that is not active, before checking the password', async () => {
    accounts.findAccount.mockResolvedValue({ passwordHash: storedHash, status: 'pending_deletion' });

    await expect(service.requestDeletion('user-1', PASSWORD, NOW)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(accounts.startDeletion).not.toHaveBeenCalled();
  });

  it('refuses an unknown account with 401', async () => {
    accounts.findAccount.mockResolvedValue(null);

    await expect(service.requestDeletion('user-1', PASSWORD, NOW)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses with 401 when the account stopped being active during the request', async () => {
    accounts.startDeletion.mockResolvedValue(false);

    await expect(service.requestDeletion('user-1', PASSWORD, NOW)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
