import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapturingMailSender } from '../../common/mail/capturing-mail-sender';
import { UsersRepository } from '../../users/users.repository';
import { CodeRequestLimitService } from '../rate-limit/code-request-limit.service';
import { verifyPassword } from '../password';
import { hashCode, verifyCode } from '../verification-code';
import { PasswordResetCodesRepository } from './password-reset-codes.repository';
import { PasswordResetService } from './password-reset.service';

type Codes = jest.Mocked<
  Pick<PasswordResetCodesRepository, 'replaceOpenCode' | 'findOpenCode' | 'reserveAttempt' | 'completeReset'>
>;
type Users = jest.Mocked<Pick<UsersRepository, 'findByEmail'>>;
type CodeRequests = jest.Mocked<Pick<CodeRequestLimitService, 'allow'>>;

const ACTIVE_USER = { id: 'user-1', email: 'alice@example.test', status: 'active' };
const PASSWORD = 'Nouveau-mot2!';

function userRow(overrides: Partial<typeof ACTIVE_USER> = {}) {
  return { ...ACTIVE_USER, ...overrides } as unknown as Awaited<ReturnType<UsersRepository['findByEmail']>>;
}

function codeFromMail(mail: { text: string }): string {
  const match = /réinitialisation est : (\d{6})/.exec(mail.text);
  if (!match) {
    throw new Error('No code in the mail.');
  }
  return match[1];
}

describe('PasswordResetService (B16, B17)', () => {
  let codes: Codes;
  let users: Users;
  let codeRequests: CodeRequests;
  let mail: CapturingMailSender;
  let service: PasswordResetService;

  beforeEach(() => {
    codes = {
      replaceOpenCode: jest.fn().mockResolvedValue(undefined),
      findOpenCode: jest.fn().mockResolvedValue(null),
      reserveAttempt: jest.fn().mockResolvedValue(true),
      completeReset: jest.fn().mockResolvedValue(true),
    };
    users = { findByEmail: jest.fn().mockResolvedValue(userRow()) };
    codeRequests = { allow: jest.fn().mockResolvedValue(true) };
    mail = new CapturingMailSender();
    const config = { getOrThrow: jest.fn().mockReturnValue(15) } as unknown as ConfigService;
    service = new PasswordResetService(
      users as unknown as UsersRepository,
      codes as unknown as PasswordResetCodesRepository,
      codeRequests as unknown as CodeRequestLimitService,
      config,
      mail,
    );
  });

  describe('request', () => {
    it('stores only a hash and mails the code to an active account', async () => {
      await service.requestCode(ACTIVE_USER.email);

      const [sent] = mail.messages();
      const code = codeFromMail(sent);
      expect(sent.to).toBe(ACTIVE_USER.email);
      expect(codes.replaceOpenCode).toHaveBeenCalledTimes(1);
      const [userId, codeHash, expiresAt] = codes.replaceOpenCode.mock.calls[0];
      expect(userId).toBe(ACTIVE_USER.id);
      expect(codeHash).not.toContain(code);
      expect(await verifyCode(codeHash, code)).toBe(true);
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    });

    it('sends nothing for an unknown address, and keeps no code', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(service.requestCode('nobody@example.test')).resolves.toBeUndefined();

      expect(mail.messages()).toEqual([]);
      expect(codes.replaceOpenCode).not.toHaveBeenCalled();
    });

    it.each(['suspended', 'pending_verification', 'deleted'])(
      'sends nothing for an account in status %s',
      async (status) => {
        users.findByEmail.mockResolvedValue(userRow({ status }));

        await service.requestCode(ACTIVE_USER.email);

        expect(mail.messages()).toEqual([]);
        expect(codes.replaceOpenCode).not.toHaveBeenCalled();
      },
    );

    it('counts the request on the account id, when the account exists', async () => {
      await service.requestCode(ACTIVE_USER.email);

      expect(codeRequests.allow).toHaveBeenCalledWith({ userId: ACTIVE_USER.id });
    });

    it('counts an unknown address by the address, so the limit applies to it too (section 9.4)', async () => {
      users.findByEmail.mockResolvedValue(null);

      await service.requestCode('nobody@example.test');

      expect(codeRequests.allow).toHaveBeenCalledWith({ email: 'nobody@example.test' });
    });

    it('sends no code and keeps the open code when the account is over its limit, and answers the same', async () => {
      codeRequests.allow.mockResolvedValue(false);

      await expect(service.requestCode(ACTIVE_USER.email)).resolves.toBeUndefined();

      expect(mail.messages()).toEqual([]);
      expect(codes.replaceOpenCode).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    const input = { email: ACTIVE_USER.email, code: '123456', password: PASSWORD };

    async function openCodeFor(code: string) {
      return { id: 'code-1', codeHash: await hashCode(code) };
    }

    it('refuses a weak password with 422, before looking at the code or using an attempt', async () => {
      await expect(service.confirmReset({ ...input, password: 'weak' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );

      expect(codes.findOpenCode).not.toHaveBeenCalled();
      expect(codes.reserveAttempt).not.toHaveBeenCalled();
    });

    it('answers 422 for an unknown address or a non-active account', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);

      users.findByEmail.mockResolvedValue(userRow({ status: 'suspended' }));
      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(codes.completeReset).not.toHaveBeenCalled();
    });

    it('answers 422 when there is no open code', async () => {
      codes.findOpenCode.mockResolvedValue(null);

      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(codes.completeReset).not.toHaveBeenCalled();
    });

    it('answers 422 when the attempts are used up, without checking the code', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));
      codes.reserveAttempt.mockResolvedValue(false);

      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(codes.completeReset).not.toHaveBeenCalled();
    });

    it('answers 422 for a wrong code, and changes nothing', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('654321'));

      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(codes.reserveAttempt).toHaveBeenCalledWith('code-1');
      expect(codes.completeReset).not.toHaveBeenCalled();
      expect(mail.messages()).toEqual([]);
    });

    it('sets the new password, closes the sessions and mails the change, on the right code', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));

      await service.confirmReset(input);

      expect(codes.completeReset).toHaveBeenCalledTimes(1);
      const [codeId, userId, passwordHash] = codes.completeReset.mock.calls[0];
      expect(codeId).toBe('code-1');
      expect(userId).toBe(ACTIVE_USER.id);
      expect(await verifyPassword(passwordHash, PASSWORD)).toBe(true);
      expect(mail.messages()).toEqual([
        expect.objectContaining({ to: ACTIVE_USER.email, subject: 'Votre mot de passe Y a été modifié' }),
      ]);
      expect(mail.messages()[0].text).not.toContain('123456');
    });

    it('answers 422 when another request consumed the code first, and sends no mail', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));
      codes.completeReset.mockResolvedValue(false);

      await expect(service.confirmReset(input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mail.messages()).toEqual([]);
    });

    it('hashes the password it stores with argon2id', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));

      await service.confirmReset(input);

      const [, , passwordHash] = codes.completeReset.mock.calls[0];
      expect(passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(passwordHash).not.toContain(PASSWORD);
    });
  });
});
