import { ConflictException, Logger } from '@nestjs/common';
import type { LoginService } from '../auth/login/login.service';
import type { MailSender } from '../common/mail/mail-sender';
import type { UsersRepository } from '../users/users.repository';
import type { AuditLogService } from './audit/audit-log.service';
import { AUDIT_ACTIONS } from './audit/audit-log.types';
import { AdminAuthService } from './admin-auth.service';
import type { AdminMfaService } from './mfa/admin-mfa.service';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const ATTEMPT = {
  email: 'admin@example.test',
  password: 'Abcdef1!',
  ipAddress: '203.0.113.7',
  userAgent: 'unit',
};
const EVENT = { ipHash: 'hash', userAgent: 'unit' };
const ACCOUNT = {
  id: 'admin-1',
  handle: 'corentin',
  displayName: 'Corentin',
  email: 'admin@example.test',
  role: 'admin',
  status: 'active',
};
const SESSION_USER = {
  id: 'admin-1',
  handle: 'corentin',
  displayName: 'Corentin',
  role: 'admin',
  status: 'active',
};

describe('AdminAuthService', () => {
  let loginService: { checkPassword: jest.Mock; completeLogin: jest.Mock; recordFailure: jest.Mock };
  let mfa: { isEnrolled: jest.Mock; verifyCode: jest.Mock; startSetup: jest.Mock; confirmSetup: jest.Mock };
  let users: { emailOf: jest.Mock };
  let audit: { append: jest.Mock };
  let mail: { send: jest.Mock };
  let service: AdminAuthService;

  beforeEach(() => {
    loginService = {
      checkPassword: jest.fn().mockResolvedValue({ status: 'ok', account: ACCOUNT, event: EVENT }),
      completeLogin: jest.fn().mockResolvedValue({ status: 'success', user: SESSION_USER }),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    mfa = {
      isEnrolled: jest.fn().mockResolvedValue(true),
      verifyCode: jest.fn().mockResolvedValue(true),
      startSetup: jest.fn(),
      confirmSetup: jest.fn().mockResolvedValue(null),
    };
    users = { emailOf: jest.fn().mockResolvedValue(ACCOUNT.email) };
    audit = { append: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AdminAuthService(
      loginService as unknown as LoginService,
      mfa as unknown as AdminMfaService,
      users as unknown as UsersRepository,
      audit as unknown as AuditLogService,
      mail as unknown as MailSender,
    );
  });

  it('checks the password as an admin-only login, so a non-admin is refused like a wrong password', async () => {
    loginService.checkPassword.mockResolvedValue({ status: 'invalid' });

    await expect(service.login(ATTEMPT, undefined, NOW)).resolves.toEqual({ status: 'invalid' });
    expect(loginService.checkPassword).toHaveBeenCalledWith({ ...ATTEMPT, adminOnly: true });
    expect(loginService.completeLogin).not.toHaveBeenCalled();
  });

  it('passes an unverified administrator through, with no session', async () => {
    loginService.checkPassword.mockResolvedValue({ status: 'unverified' });

    await expect(service.login(ATTEMPT, undefined, NOW)).resolves.toEqual({ status: 'unverified' });
  });

  it('sends an account without a second factor to the set-up, with no e-mail alert', async () => {
    mfa.isEnrolled.mockResolvedValue(false);

    await expect(service.login(ATTEMPT, undefined, NOW)).resolves.toEqual({
      status: 'setup_required',
      user: SESSION_USER,
    });
    expect(loginService.completeLogin).toHaveBeenCalledWith(ACCOUNT, EVENT);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses the set-up when a lock is set between the password and the completion, with no e-mail alert', async () => {
    mfa.isEnrolled.mockResolvedValue(false);
    loginService.completeLogin.mockResolvedValue({ status: 'invalid' });

    await expect(service.login(ATTEMPT, undefined, NOW)).resolves.toEqual({ status: 'invalid' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('asks for the second factor after a correct password, and does not count the attempt', async () => {
    await expect(service.login(ATTEMPT, undefined, NOW)).resolves.toEqual({ status: 'code_required' });
    expect(loginService.completeLogin).not.toHaveBeenCalled();
    expect(loginService.recordFailure).not.toHaveBeenCalled();
  });

  it('counts a wrong second factor toward the lock, and refuses it', async () => {
    mfa.verifyCode.mockResolvedValue(false);

    await expect(service.login(ATTEMPT, '000000', NOW)).resolves.toEqual({ status: 'invalid_code' });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.adminLogin, result: 'failed' }),
    );
    expect(loginService.recordFailure).toHaveBeenCalledWith(ACCOUNT, EVENT);
    expect(loginService.completeLogin).not.toHaveBeenCalled();
  });

  it('signs in with a right second factor, and sends the e-mail alert to the account', async () => {
    await expect(service.login(ATTEMPT, '123456', NOW)).resolves.toEqual({
      status: 'ok',
      user: SESSION_USER,
    });
    expect(mfa.verifyCode).toHaveBeenCalledWith('admin-1', '123456', NOW);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: ACCOUNT.email }));
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', action: AUDIT_ACTIONS.adminLogin, result: 'ok' }),
    );
  });

  it('still signs in when the alert e-mail cannot be sent, and logs the failure without the address', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mail.send.mockRejectedValue(new Error('Brevo is down'));

    await expect(service.login(ATTEMPT, '123456', NOW)).resolves.toEqual({
      status: 'ok',
      user: SESSION_USER,
    });
    expect(logged).toHaveBeenCalledWith('The back-office sign-in alert could not be sent.');
    expect(logged.mock.calls.flat().join(' ')).not.toContain(ACCOUNT.email);
    logged.mockRestore();
  });

  it('refuses the sign-in when a lock is set between the second factor and the completion', async () => {
    loginService.completeLogin.mockResolvedValue({ status: 'invalid' });

    await expect(service.login(ATTEMPT, '123456', NOW)).resolves.toEqual({ status: 'invalid' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses a second set-up when a second factor is already enrolled', async () => {
    mfa.isEnrolled.mockResolvedValue(true);

    await expect(service.startSetup('admin-1', 'corentin')).rejects.toThrow(ConflictException);
    expect(mfa.startSetup).not.toHaveBeenCalled();
  });

  it('alerts the administrator by e-mail when a set-up is confirmed, and nothing on a wrong code', async () => {
    mfa.confirmSetup.mockResolvedValue(null);
    await expect(
      service.confirmSetup('admin-1', { secretEncrypted: 'E', startedAt: NOW.toISOString() }, '000000', NOW),
    ).resolves.toBeNull();
    expect(mail.send).not.toHaveBeenCalled();

    mfa.confirmSetup.mockResolvedValue(['ABCDE-FGHJK']);
    await expect(
      service.confirmSetup('admin-1', { secretEncrypted: 'E', startedAt: NOW.toISOString() }, '123456', NOW),
    ).resolves.toEqual(['ABCDE-FGHJK']);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: ACCOUNT.email }));
  });

  it('confirms the set-up without an e-mail alert when the account has no address any more', async () => {
    users.emailOf.mockResolvedValue(null);
    mfa.confirmSetup.mockResolvedValue(['ABCDE-FGHJK']);

    await expect(
      service.confirmSetup('admin-1', { secretEncrypted: 'E', startedAt: NOW.toISOString() }, '123456', NOW),
    ).resolves.toEqual(['ABCDE-FGHJK']);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
