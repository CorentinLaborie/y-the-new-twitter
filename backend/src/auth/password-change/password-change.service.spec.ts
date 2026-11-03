import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import type { MailSender } from '../../common/mail/mail-sender';
import type { SessionUser } from '../session/session-user.repository';
import { hashPassword } from '../password';
import { passwordChangedMail } from '../password-reset/password-reset-mail';
import { PasswordChangeRepository } from './password-change.repository';
import { PasswordChangeService } from './password-change.service';

const VIEWER: SessionUser = {
  id: 'user-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};
const TX = { tag: 'transaction' };
const OLD_PASSWORD = 'Ancien-mot-2!';
const NEW_PASSWORD = 'Nouveau-mot-3!';
const SESSION_ID = 'current-session';

describe('PasswordChangeService (L5, step 3)', () => {
  let passwordHash: string;
  let repository: {
    transaction: jest.Mock;
    lockAccount: jest.Mock;
    findCredentials: jest.Mock;
    replacePassword: jest.Mock;
  };
  let mail: { send: jest.Mock };
  let service: PasswordChangeService;

  beforeAll(async () => {
    passwordHash = await hashPassword(OLD_PASSWORD);
  });

  beforeEach(() => {
    repository = {
      transaction: jest.fn((write) => write(TX)),
      lockAccount: jest.fn().mockResolvedValue('active'),
      findCredentials: jest.fn().mockResolvedValue({
        email: 'alice@example.test',
        passwordHash,
        status: 'active',
      }),
      replacePassword: jest.fn().mockResolvedValue(undefined),
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new PasswordChangeService(
      repository as unknown as PasswordChangeRepository,
      mail as unknown as MailSender,
    );
  });

  it('refuses a new password outside the policy (422) before any read', async () => {
    await expect(
      service.change(VIEWER, SESSION_ID, { currentPassword: OLD_PASSWORD, newPassword: 'court' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('refuses a wrong current password (422), and writes nothing', async () => {
    await expect(
      service.change(VIEWER, SESSION_ID, { currentPassword: 'Mauvais-mot-2!', newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(repository.replacePassword).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('replaces the hash, keeps the current session, and sends the notice after the commit', async () => {
    await service.change(VIEWER, SESSION_ID, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });

    expect(repository.replacePassword).toHaveBeenCalledWith(TX, VIEWER.id, expect.any(String), SESSION_ID);
    const [, , newHash] = repository.replacePassword.mock.calls[0]!;
    expect(newHash).not.toBe(passwordHash);
    expect(mail.send).toHaveBeenCalledWith(passwordChangedMail('alice@example.test'));
  });

  it('accepts a new password equal to the old one (decision 2)', async () => {
    await expect(
      service.change(VIEWER, SESSION_ID, { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD }),
    ).resolves.toBeUndefined();
    expect(repository.replacePassword).toHaveBeenCalledTimes(1);
  });

  it('refuses an account that is not active under the lock (403), with nothing written', async () => {
    repository.lockAccount.mockResolvedValue('suspended');

    await expect(
      service.change(VIEWER, SESSION_ID, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.replacePassword).not.toHaveBeenCalled();
  });
});
