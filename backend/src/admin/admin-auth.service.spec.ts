import { Logger } from '@nestjs/common';
import type { LoginService } from '../auth/login/login.service';
import type { MailSender } from '../common/mail/mail-sender';
import type { UsersRepository } from '../users/users.repository';
import type { AuditLogService } from './audit/audit-log.service';
import { AUDIT_ACTIONS } from './audit/audit-log.types';
import { AdminAuthService } from './admin-auth.service';

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
const NETWORK = { ipAddress: '203.0.113.7', userAgent: 'unit' };

describe('AdminAuthService (email and password only)', () => {
  let loginService: { checkPassword: jest.Mock; completeLogin: jest.Mock; recordFailure: jest.Mock };
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
    users = { emailOf: jest.fn().mockResolvedValue(ACCOUNT.email) };
    audit = { append: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AdminAuthService(
      loginService as unknown as LoginService,
      users as unknown as UsersRepository,
      audit as unknown as AuditLogService,
      mail as unknown as MailSender,
    );
  });

  it('signs an administrator in with the password, records the sign-in and sends the e-mail alert', async () => {
    await expect(service.login(ATTEMPT, NOW)).resolves.toEqual({ status: 'ok', user: SESSION_USER });

    expect(loginService.checkPassword).toHaveBeenCalledWith({ ...ATTEMPT, adminOnly: true });
    expect(loginService.completeLogin).toHaveBeenCalledWith(ACCOUNT, EVENT);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', action: AUDIT_ACTIONS.adminLogin, result: 'ok' }),
    );
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: ACCOUNT.email }));
  });

  it('checks the password as an admin-only login, so a non-admin is refused like a wrong password', async () => {
    loginService.checkPassword.mockResolvedValue({ status: 'invalid' });

    await expect(service.login(ATTEMPT, NOW)).resolves.toEqual({ status: 'invalid' });
    expect(loginService.completeLogin).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('passes an unverified administrator through, with no session', async () => {
    loginService.checkPassword.mockResolvedValue({ status: 'unverified' });

    await expect(service.login(ATTEMPT, NOW)).resolves.toEqual({ status: 'unverified' });
    expect(loginService.completeLogin).not.toHaveBeenCalled();
  });

  it('refuses the sign-in when a lock is set between the password and the completion, with no e-mail alert', async () => {
    loginService.completeLogin.mockResolvedValue({ status: 'invalid' });

    await expect(service.login(ATTEMPT, NOW)).resolves.toEqual({ status: 'invalid' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('still signs in when the alert e-mail cannot be sent, and logs the failure without the address', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mail.send.mockRejectedValue(new Error('Brevo is down'));

    await expect(service.login(ATTEMPT, NOW)).resolves.toEqual({ status: 'ok', user: SESSION_USER });
    expect(logged).toHaveBeenCalledWith('The back-office sign-in alert could not be sent.');
    expect(logged.mock.calls.flat().join(' ')).not.toContain(ACCOUNT.email);
    logged.mockRestore();
  });

  describe('reauthenticate (DEC-088)', () => {
    it('accepts the right password', async () => {
      await expect(service.reauthenticate('admin-1', NETWORK, 'Abcdef1!')).resolves.toBe('ok');
      expect(loginService.checkPassword).toHaveBeenCalledWith({
        email: ACCOUNT.email,
        password: 'Abcdef1!',
        ipAddress: NETWORK.ipAddress,
        userAgent: NETWORK.userAgent,
        adminOnly: true,
      });
    });

    it('refuses a wrong password', async () => {
      loginService.checkPassword.mockResolvedValue({ status: 'invalid' });

      await expect(service.reauthenticate('admin-1', NETWORK, 'wrong')).resolves.toBe('invalid');
    });

    it('refuses an unverified account like a wrong password', async () => {
      loginService.checkPassword.mockResolvedValue({ status: 'unverified' });

      await expect(service.reauthenticate('admin-1', NETWORK, 'Abcdef1!')).resolves.toBe('invalid');
    });

    it('refuses when the account has no address any more', async () => {
      users.emailOf.mockResolvedValue(null);

      await expect(service.reauthenticate('admin-1', NETWORK, 'Abcdef1!')).resolves.toBe('invalid');
      expect(loginService.checkPassword).not.toHaveBeenCalled();
    });
  });
});
