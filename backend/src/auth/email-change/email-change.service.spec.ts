import { ConflictException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CapturingMailSender } from '../../common/mail/capturing-mail-sender';
import { UsersRepository } from '../../users/users.repository';
import { CodeRequestLimitService } from '../rate-limit/code-request-limit.service';
import { hashCode, verifyCode } from '../verification-code';
import { EmailChangeCodesRepository } from './email-change-codes.repository';
import { EmailChangeService } from './email-change.service';

type Codes = jest.Mocked<
  Pick<
    EmailChangeCodesRepository,
    'findAccount' | 'replaceOpenCode' | 'findOpenCode' | 'reserveAttempt' | 'completeChange'
  >
>;
type Users = jest.Mocked<Pick<UsersRepository, 'findByEmail'>>;
type CodeRequests = jest.Mocked<Pick<CodeRequestLimitService, 'allow'>>;

const USER_ID = 'user-1';
const OLD_EMAIL = 'alice@example.test';
const NEW_EMAIL = 'alice.new@example.test';

function userRow(overrides: { id?: string; email?: string; status?: string } = {}) {
  return { id: USER_ID, email: OLD_EMAIL, status: 'active', ...overrides } as unknown as Awaited<
    ReturnType<UsersRepository['findByEmail']>
  >;
}

function codeFromMail(text: string): string {
  const match = /confirmation est : (\d{6})/.exec(text);
  if (!match) {
    throw new Error('No code in the mail.');
  }
  return match[1];
}

describe('EmailChangeService (B18, B19)', () => {
  let codes: Codes;
  let users: Users;
  let codeRequests: CodeRequests;
  let mail: CapturingMailSender;
  let service: EmailChangeService;

  beforeEach(() => {
    codes = {
      findAccount: jest.fn().mockResolvedValue({ email: OLD_EMAIL, status: 'active' }),
      replaceOpenCode: jest.fn().mockResolvedValue(undefined),
      findOpenCode: jest.fn().mockResolvedValue(null),
      reserveAttempt: jest.fn().mockResolvedValue(true),
      completeChange: jest.fn().mockResolvedValue('changed'),
    };
    users = { findByEmail: jest.fn().mockResolvedValue(null) };
    codeRequests = { allow: jest.fn().mockResolvedValue(true) };
    mail = new CapturingMailSender();
    const config = { getOrThrow: jest.fn().mockReturnValue(15) } as unknown as ConfigService;
    service = new EmailChangeService(
      users as unknown as UsersRepository,
      codes as unknown as EmailChangeCodesRepository,
      codeRequests as unknown as CodeRequestLimitService,
      config,
      mail,
    );
  });

  describe('request', () => {
    it('sends the code to the new address only, and stores a hash', async () => {
      await service.requestChange(USER_ID, NEW_EMAIL);

      const [sent] = mail.messages();
      const code = codeFromMail(sent.text);
      expect(sent.to).toBe(NEW_EMAIL);
      expect(codes.replaceOpenCode).toHaveBeenCalledTimes(1);
      const [userId, newEmail, codeHash, expiresAt] = codes.replaceOpenCode.mock.calls[0];
      expect(userId).toBe(USER_ID);
      expect(newEmail).toBe(NEW_EMAIL);
      expect(codeHash).not.toContain(code);
      expect(await verifyCode(codeHash, code)).toBe(true);
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    });

    it('sends nothing when another account already uses the address, and keeps no code', async () => {
      users.findByEmail.mockResolvedValue(userRow({ id: 'user-2', email: NEW_EMAIL }));

      await expect(service.requestChange(USER_ID, NEW_EMAIL)).resolves.toBeUndefined();

      expect(mail.messages()).toEqual([]);
      expect(codes.replaceOpenCode).not.toHaveBeenCalled();
    });

    it('counts the request on the account id (section 9.4)', async () => {
      await service.requestChange(USER_ID, NEW_EMAIL);

      expect(codeRequests.allow).toHaveBeenCalledWith({ userId: USER_ID });
    });

    it('sends nothing and keeps the open code when the account is over its limit, and answers the same', async () => {
      codeRequests.allow.mockResolvedValue(false);

      await expect(service.requestChange(USER_ID, NEW_EMAIL)).resolves.toBeUndefined();

      expect(mail.messages()).toEqual([]);
      expect(codes.replaceOpenCode).not.toHaveBeenCalled();
    });

    it('sends nothing when the address is the current one', async () => {
      await service.requestChange(USER_ID, OLD_EMAIL);

      expect(mail.messages()).toEqual([]);
      expect(codes.replaceOpenCode).not.toHaveBeenCalled();
    });

    it('refuses an account that is not active, with 401', async () => {
      codes.findAccount.mockResolvedValue({ email: OLD_EMAIL, status: 'suspended' });

      await expect(service.requestChange(USER_ID, NEW_EMAIL)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mail.messages()).toEqual([]);
    });

    it('refuses a session whose account no longer exists, with 401', async () => {
      codes.findAccount.mockResolvedValue(null);

      await expect(service.requestChange(USER_ID, NEW_EMAIL)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('confirm', () => {
    async function openCodeFor(code: string) {
      return { id: 'code-1', codeHash: await hashCode(code), newEmail: NEW_EMAIL };
    }

    it('answers 422 when there is no open code, and changes nothing', async () => {
      await expect(service.confirmChange(USER_ID, '123456')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );

      expect(codes.completeChange).not.toHaveBeenCalled();
    });

    it('answers 422 when the attempts are used up, without checking the code', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));
      codes.reserveAttempt.mockResolvedValue(false);

      await expect(service.confirmChange(USER_ID, '123456')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(codes.completeChange).not.toHaveBeenCalled();
    });

    it('answers 422 for a wrong code, keeps the address and sends no mail', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('654321'));

      await expect(service.confirmChange(USER_ID, '123456')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(codes.reserveAttempt).toHaveBeenCalledWith('code-1');
      expect(codes.completeChange).not.toHaveBeenCalled();
      expect(mail.messages()).toEqual([]);
    });

    it('switches the address, then tells the former address, on the right code', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));

      await service.confirmChange(USER_ID, '123456');

      expect(codes.completeChange).toHaveBeenCalledWith('code-1', USER_ID, NEW_EMAIL);
      expect(mail.messages()).toEqual([
        expect.objectContaining({ to: OLD_EMAIL, subject: 'Votre adresse e-mail Y a été modifiée' }),
      ]);
      expect(mail.messages()[0].text).not.toContain(NEW_EMAIL);
    });

    it('answers 409 when the address was taken after the request, and sends no mail', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));
      codes.completeChange.mockResolvedValue('taken');

      await expect(service.confirmChange(USER_ID, '123456')).rejects.toBeInstanceOf(ConflictException);
      expect(mail.messages()).toEqual([]);
    });

    it('answers 422 when the code was consumed by another request first', async () => {
      codes.findOpenCode.mockResolvedValue(await openCodeFor('123456'));
      codes.completeChange.mockResolvedValue('code-used');

      await expect(service.confirmChange(USER_ID, '123456')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(mail.messages()).toEqual([]);
    });
  });
});
