import { canStartAdminDeletion, contactThreadPlan, statusChangeKind } from './status-change';
import { reactivationMail, suspensionMail } from './status-change-mail';

describe('canStartAdminDeletion (R16, owner decision 2026-10-21)', () => {
  it('allows an active or a suspended account', () => {
    expect(canStartAdminDeletion('active')).toBe(true);
    expect(canStartAdminDeletion('suspended')).toBe(true);
  });

  it('refuses an account already pending, erased or not yet verified', () => {
    expect(canStartAdminDeletion('pending_deletion')).toBe(false);
    expect(canStartAdminDeletion('deleted')).toBe(false);
    expect(canStartAdminDeletion('pending_verification')).toBe(false);
  });
});

describe('status change rules (DEC-077, DEC-116)', () => {
  it('suspends an active account and lifts the suspension of a suspended one', () => {
    expect(statusChangeKind('active', 'suspended')).toBe('suspend');
    expect(statusChangeKind('suspended', 'active')).toBe('reactivate');
  });

  it('refuses every other change, including a change that changes nothing', () => {
    expect(statusChangeKind('active', 'active')).toBeNull();
    expect(statusChangeKind('suspended', 'suspended')).toBeNull();
    expect(statusChangeKind('pending_deletion', 'suspended')).toBeNull();
    expect(statusChangeKind('pending_deletion', 'active')).toBeNull();
    expect(statusChangeKind('deleted', 'active')).toBeNull();
    expect(statusChangeKind('pending_verification', 'suspended')).toBeNull();
  });

  it('closes the open contact thread at a lifting, whatever its status is (DEC-116 3)', () => {
    expect(contactThreadPlan('reactivate', { id: 't1', status: 'new', closedByLift: false })).toEqual({
      kind: 'close',
      threadId: 't1',
    });
    expect(contactThreadPlan('reactivate', { id: 't1', status: 'replied', closedByLift: false })).toEqual({
      kind: 'close',
      threadId: 't1',
    });
  });

  it('reopens the thread that a lifting closed at the next suspension, with the same reference (DEC-116 4)', () => {
    expect(contactThreadPlan('suspend', { id: 't1', status: 'closed', closedByLift: true })).toEqual({
      kind: 'reopen',
      threadId: 't1',
    });
  });

  it('leaves a thread closed with "Marquer comme traité" closed, at a suspension and at a lifting', () => {
    expect(contactThreadPlan('suspend', { id: 't1', status: 'closed', closedByLift: false })).toBeNull();
    expect(contactThreadPlan('reactivate', { id: 't1', status: 'closed', closedByLift: false })).toBeNull();
  });

  it('changes no thread when the account has none', () => {
    expect(contactThreadPlan('suspend', null)).toBeNull();
    expect(contactThreadPlan('reactivate', null)).toBeNull();
  });
});

describe('status change e-mails (R18)', () => {
  it('gives the reason of the suspension and the contact address of the legal notice', () => {
    const mail = suspensionMail('alice@example.test', 'Propos injurieux');

    expect(mail.to).toBe('alice@example.test');
    expect(mail.text).toContain('Motif : Propos injurieux');
    expect(mail.text).toContain('mentions légales');
  });

  it('announces the lifting of the suspension', () => {
    const mail = reactivationMail('alice@example.test');

    expect(mail.to).toBe('alice@example.test');
    expect(mail.subject).toContain('de nouveau actif');
  });
});
