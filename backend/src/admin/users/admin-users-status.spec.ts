import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import type { MailSender } from '../../common/mail/mail-sender';
import type { AuditLogService } from '../audit/audit-log.service';
import { AdminUsersRepository, type AccountDetails } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ACTOR_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const TARGET_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
/** The transaction the repository opens. The audit entries are written on it (DEC-088). */
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
    suspensionReason: null,
  };
}

describe('AdminUsersService.changeStatus (DEC-077, DEC-116, R13, R18)', () => {
  let repository: {
    findById: jest.Mock;
    contactThreadOf: jest.Mock;
    applyStatusChange: jest.Mock;
  };
  let audit: { appendIn: jest.Mock };
  let mail: { send: jest.Mock };
  let service: AdminUsersService;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(account('active')),
      contactThreadOf: jest.fn().mockResolvedValue(null),
      // Like the real repository: the change runs its `record` callback on its own transaction.
      applyStatusChange: jest.fn(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record(TRANSACTION);
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

  it('refuses to change the status of the administrator own account, with no write', async () => {
    await expect(
      service.changeStatus(ACTOR_ID, ACTOR_ID, { status: 'suspended', reason: 'Test' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.applyStatusChange).not.toHaveBeenCalled();
  });

  it('refuses to suspend an administrator or a moderator, with no write', async () => {
    for (const role of ['admin', 'moderator'] as const) {
      repository.findById.mockResolvedValue({ ...account('active'), role });

      await expect(
        service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Test' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    expect(repository.applyStatusChange).not.toHaveBeenCalled();
  });

  it('writes the change only from the status it was decided from (no lost update)', async () => {
    await service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Test' }, NOW);

    expect(repository.applyStatusChange).toHaveBeenCalledWith(expect.objectContaining({ expectedStatus: 'active' }));
  });

  it('answers 404 to an unknown account, with no write', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Test' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.applyStatusChange).not.toHaveBeenCalled();
  });

  it.each([
    ['active', 'active'],
    ['suspended', 'suspended'],
    ['pending_deletion', 'suspended'],
    ['pending_deletion', 'active'],
  ] as const)('refuses the change from %s to %s with 409, and writes nothing', async (current, requested) => {
    repository.findById.mockResolvedValue(account(current));

    await expect(
      service.changeStatus(ACTOR_ID, TARGET_ID, { status: requested, reason: 'Test' }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.applyStatusChange).not.toHaveBeenCalled();
    expect(audit.appendIn).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('suspends an active account in one transaction, which holds the audit entry, then e-mails the account', async () => {
    const result = await service.changeStatus(
      ACTOR_ID,
      TARGET_ID,
      { status: 'suspended', reason: 'Propos injurieux' },
      NOW,
    );

    expect(repository.applyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TARGET_ID,
        status: 'suspended',
        reason: 'Propos injurieux',
        now: NOW,
        closedById: ACTOR_ID,
        thread: null,
      }),
    );
    expect(audit.appendIn).toHaveBeenCalledWith(TRANSACTION, {
      actorId: ACTOR_ID,
      action: 'user.suspend',
      result: 'ok',
      targetType: 'user',
      targetId: TARGET_ID,
      reason: 'Propos injurieux',
      details: null,
    });
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.test',
        text: expect.stringContaining('Motif : Propos injurieux'),
      }),
    );
    expect(result).toEqual({
      id: TARGET_ID,
      status: 'suspended',
      statusChangedAt: NOW.toISOString(),
      suspensionReason: 'Propos injurieux',
    });
  });

  it('does not e-mail when the audit write in the transaction fails, so nothing is announced for a rolled-back change', async () => {
    audit.appendIn.mockRejectedValue(new Error('audit down'));

    await expect(
      service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Test' }, NOW),
    ).rejects.toThrow('audit down');
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('lifts a suspension: the reason is not kept on the account, the audit keeps it, and an e-mail goes out', async () => {
    repository.findById.mockResolvedValue(account('suspended'));

    const result = await service.changeStatus(
      ACTOR_ID,
      TARGET_ID,
      { status: 'active', reason: 'Erreur' },
      NOW,
    );

    expect(repository.applyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', reason: null }),
    );
    expect(audit.appendIn).toHaveBeenCalledWith(
      TRANSACTION,
      expect.objectContaining({ action: 'user.reactivate', reason: 'Erreur' }),
    );
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.test' }));
    expect(result.suspensionReason).toBeNull();
  });

  it('closes the open contact thread at a lifting, and audits the closing without a reason (DEC-116)', async () => {
    repository.findById.mockResolvedValue(account('suspended'));
    repository.contactThreadOf.mockResolvedValue({ id: 'thread-1', status: 'replied', closedByLift: false });

    await service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'active', reason: 'Erreur' }, NOW);

    expect(repository.applyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ thread: { kind: 'close', threadId: 'thread-1' } }),
    );
    expect(audit.appendIn).toHaveBeenCalledWith(TRANSACTION, {
      actorId: ACTOR_ID,
      action: 'contact.close',
      result: 'ok',
      targetType: 'contact',
      targetId: 'thread-1',
      reason: null,
      details: null,
    });
  });

  it('reopens the thread that a lifting closed, at the next suspension, with no contact audit entry', async () => {
    repository.contactThreadOf.mockResolvedValue({ id: 'thread-1', status: 'closed', closedByLift: true });

    await service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Récidive' }, NOW);

    expect(repository.applyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ thread: { kind: 'reopen', threadId: 'thread-1' } }),
    );
    expect(audit.appendIn).toHaveBeenCalledTimes(1);
  });

  it('keeps a thread closed with "Marquer comme traité" closed at a lifting', async () => {
    repository.findById.mockResolvedValue(account('suspended'));
    repository.contactThreadOf.mockResolvedValue({ id: 'thread-1', status: 'closed', closedByLift: false });

    await service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'active', reason: 'Erreur' }, NOW);

    expect(repository.applyStatusChange).toHaveBeenCalledWith(expect.objectContaining({ thread: null }));
  });

  it('keeps the change when the e-mail cannot be sent, and logs the failure without the address', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mail.send.mockRejectedValue(new Error('provider down'));

    await expect(
      service.changeStatus(ACTOR_ID, TARGET_ID, { status: 'suspended', reason: 'Test' }, NOW),
    ).resolves.toMatchObject({ status: 'suspended' });
    expect(repository.applyStatusChange).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls.flat().join(' ')).not.toContain('alice@example.test');
    logged.mockRestore();
  });
});
