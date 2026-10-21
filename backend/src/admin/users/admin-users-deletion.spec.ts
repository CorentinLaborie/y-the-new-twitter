import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { DELETION_WINDOW_MS } from '../../auth/account-deletion/account-deletion.service';
import type { MailSender } from '../../common/mail/mail-sender';
import type { AuditLogService } from '../audit/audit-log.service';
import { AdminUsersRepository, type AccountDetails } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ACTOR_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const TARGET_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
/** The transaction the repository opens. The audit entry is written on it. */
const TRANSACTION = { tag: 'transaction' };

function account(status: AccountDetails['status']): AccountDetails {
  return {
    id: TARGET_ID,
    handle: 'alice',
    displayName: 'Compte alice',
    email: 'alice@example.test',
    status,
    role: 'user',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    statusChangedAt: null,
    suspensionReason: status === 'suspended' ? 'Propos injurieux' : null,
  };
}

describe('AdminUsersService.startDeletion (R16, owner decision 2026-10-21)', () => {
  let repository: { findById: jest.Mock; startDeletion: jest.Mock };
  let audit: { appendIn: jest.Mock };
  let mail: { send: jest.Mock };
  let service: AdminUsersService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(account('active')),
      // Like the real repository: the change runs its `record` callback on its own transaction.
      startDeletion: jest.fn(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record(TRANSACTION);
        return true;
      }),
    };
    audit = { appendIn: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AdminUsersService(
      repository as unknown as AdminUsersRepository,
      audit as unknown as AuditLogService,
      mail as unknown as MailSender,
    );
  });

  it('refuses to delete the administrator own account, with no write', async () => {
    await expect(
      service.startDeletion(ACTOR_ID, ACTOR_ID, { reasonCode: 'spam' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.startDeletion).not.toHaveBeenCalled();
  });

  it('answers 404 to an unknown account, with no write', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.startDeletion).not.toHaveBeenCalled();
  });

  it.each(['pending_verification', 'pending_deletion', 'deleted'] as const)(
    'refuses to delete an account in status %s with 409, and writes nothing',
    async (status) => {
      repository.findById.mockResolvedValue(account(status));

      await expect(
        service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.startDeletion).not.toHaveBeenCalled();
      expect(audit.appendIn).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'moderator'] as const)(
    'refuses to delete an account with the role %s, with 409, and writes nothing',
    async (role) => {
      repository.findById.mockResolvedValue({ ...account('active'), role });

      await expect(service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.startDeletion).not.toHaveBeenCalled();
      expect(audit.appendIn).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    },
  );

  it('refuses with 409 when the account changed between the read and the write, and does not e-mail', async () => {
    repository.startDeletion.mockResolvedValue(false);

    await expect(
      service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('starts the window of the user own deletion, with the purge 90 days later', async () => {
    repository.findById.mockResolvedValue(account('suspended'));

    await service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'abuse' }, NOW);

    expect(repository.startDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TARGET_ID,
        now: NOW,
        purgeAt: new Date(NOW.getTime() + DELETION_WINDOW_MS),
        origin: 'administrator',
      }),
    );
  });

  it('writes the audit entry with the label of the reason and its code, in the same transaction', async () => {
    await service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'identity_theft' }, NOW);

    expect(audit.appendIn).toHaveBeenCalledWith(TRANSACTION, {
      actorId: ACTOR_ID,
      action: 'user.delete',
      result: 'ok',
      targetType: 'user',
      targetId: TARGET_ID,
      reason: 'Usurpation d’identité',
      details: { reasonCode: 'identity_theft' },
    });
  });

  it('writes the free text as the reason when the reason is "Autre"', async () => {
    await service.startDeletion(
      ACTOR_ID,
      TARGET_ID,
      { reasonCode: 'other', otherReason: 'Compte piraté' },
      NOW,
    );

    expect(audit.appendIn).toHaveBeenCalledWith(
      TRANSACTION,
      expect.objectContaining({ reason: 'Compte piraté', details: { reasonCode: 'other' } }),
    );
  });

  it('e-mails the user the reason and the window, after the commit', async () => {
    const result = await service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW);

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.test',
        text: expect.stringContaining('Motif : Spam'),
      }),
    );
    expect(mail.send.mock.calls[0]?.[0].text).toContain('90 jours');
    expect(result).toEqual({
      id: TARGET_ID,
      status: 'pending_deletion',
      statusChangedAt: NOW.toISOString(),
      suspensionReason: null,
    });
  });

  it('does not e-mail when the audit write fails, so the rolled-back deletion is not announced', async () => {
    audit.appendIn.mockRejectedValue(new Error('audit down'));

    await expect(service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW)).rejects.toThrow(
      'audit down',
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('keeps the deletion when the e-mail cannot be sent, and logs the failure without the address', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mail.send.mockRejectedValue(new Error('provider down'));

    const result = await service.startDeletion(ACTOR_ID, TARGET_ID, { reasonCode: 'spam' }, NOW);

    expect(result.status).toBe('pending_deletion');
    expect(logged).toHaveBeenCalledWith('The account status e-mail could not be sent.');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('alice@example.test');
    logged.mockRestore();
  });
});
