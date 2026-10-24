import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { CapturingMailSender } from '../../common/mail/capturing-mail-sender';
import { hashPassword } from '../password';
import { AccountDeletionRepository } from './account-deletion.repository';
import { AccountDeletionService, DELETION_WINDOW_MS } from './account-deletion.service';
import type { AccountDeletionDto } from './dto/account-deletion.dto';

const PASSWORD = 'Abcdef1!';
const NOW = new Date('2026-10-21T10:00:00.000Z');
const PURGE_AT = new Date(NOW.getTime() + DELETION_WINDOW_MS);
const DTO: AccountDeletionDto = {
  password: PASSWORD,
  reasonCode: 'spam',
  email: 'alice@example.test',
};

describe('AccountDeletionService (R16, L5 step 7)', () => {
  let storedHash: string;
  let accounts: { findAccount: jest.Mock; startDeletion: jest.Mock };
  let mail: CapturingMailSender;
  let service: AccountDeletionService;

  beforeAll(async () => {
    storedHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    accounts = {
      findAccount: jest.fn().mockResolvedValue({ passwordHash: storedHash, status: 'active' }),
      startDeletion: jest.fn().mockResolvedValue(true),
    };
    mail = new CapturingMailSender();
    service = new AccountDeletionService(accounts as unknown as AccountDeletionRepository, mail);
  });

  it('starts the window for the current password, with the purge 90 days later, and answers that date', async () => {
    const purgeAt = await service.requestDeletion('user-1', DTO, NOW);

    expect(DELETION_WINDOW_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(purgeAt).toEqual(PURGE_AT);
    expect(accounts.startDeletion).toHaveBeenCalledWith('user-1', NOW, PURGE_AT, {
      reason: 'Spam',
      email: 'alice@example.test',
    });
  });

  it('keeps the free text of Autre as the reason', async () => {
    await service.requestDeletion('user-1', { ...DTO, reasonCode: 'other', otherReason: 'Motif précis' }, NOW);

    expect(accounts.startDeletion).toHaveBeenCalledWith(
      'user-1',
      NOW,
      PURGE_AT,
      expect.objectContaining({ reason: 'Motif précis' }),
    );
  });

  it('sends the deletion mail to the address typed, after the change is written', async () => {
    await service.requestDeletion('user-1', DTO, NOW);

    expect(mail.messages()).toHaveLength(1);
    expect(mail.messages()[0]?.to).toBe('alice@example.test');
    expect(mail.messages()[0]?.text).toContain('seront supprimés le');
  });

  it('refuses a wrong password with 422, and changes nothing', async () => {
    await expect(service.requestDeletion('user-1', { ...DTO, password: 'Abcdef1?' }, NOW)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(accounts.startDeletion).not.toHaveBeenCalled();
    expect(mail.messages()).toHaveLength(0);
  });

  it('refuses an account that is not active, before checking the password', async () => {
    accounts.findAccount.mockResolvedValue({ passwordHash: storedHash, status: 'pending_deletion' });

    await expect(service.requestDeletion('user-1', DTO, NOW)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(accounts.startDeletion).not.toHaveBeenCalled();
  });

  it('refuses an unknown account with 401', async () => {
    accounts.findAccount.mockResolvedValue(null);

    await expect(service.requestDeletion('user-1', DTO, NOW)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses with 401 when the account stopped being active during the request, and sends no mail', async () => {
    accounts.startDeletion.mockResolvedValue(false);

    await expect(service.requestDeletion('user-1', DTO, NOW)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mail.messages()).toHaveLength(0);
  });
});
