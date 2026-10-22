import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { SignupDto } from '../dto/signup.dto';
import { hashCode, verifyCode } from '../verification-code';
import { SignupService } from './signup.service';

type Mock = jest.Mock;

function build() {
  const users = {
    findByHandle: jest.fn() as Mock,
    findByEmail: jest.fn() as Mock,
    create: jest.fn() as Mock,
    activate: jest.fn() as Mock,
  };
  const codes = {
    create: jest.fn() as Mock,
    findOpen: jest.fn() as Mock,
    reserveAttempt: jest.fn().mockResolvedValue(true) as Mock,
    consume: jest.fn() as Mock,
    invalidateOpen: jest.fn() as Mock,
  };
  const activation = { recordAgeCheck: jest.fn() as Mock };
  const codeRequests = { allow: jest.fn().mockResolvedValue(true) as Mock };
  const mail = { send: jest.fn() as Mock };
  const ageVerifier = { check: jest.fn() as Mock };
  const config = { getOrThrow: jest.fn().mockReturnValue('15') };
  const prisma = { $transaction: jest.fn() as Mock };
  prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(prisma));

  const service = new SignupService(
    prisma as never,
    config as never,
    users as never,
    codes as never,
    activation as never,
    codeRequests as never,
    mail,
    ageVerifier,
  );

  return { service, users, codes, activation, codeRequests, mail, ageVerifier };
}

const signupInput = {
  handle: 'alice',
  displayName: 'Alice',
  email: 'alice@example.test',
  password: 'Abcdef1!',
  birthDate: new Date('1990-01-01'),
  termsAccepted: true,
  termsVersion: '1.0',
} as SignupDto;

const pendingUser = {
  id: 'user-1',
  email: 'alice@example.test',
  status: 'pending_verification',
  birthDate: new Date('1990-01-01'),
};

describe('SignupService', () => {
  describe('signup (B7)', () => {
    it('refuses a handle already taken, whatever its case, and sends nothing', async () => {
      const { service, users, mail } = build();
      users.findByHandle.mockResolvedValue({ id: 'other' });

      await expect(service.signup(signupInput)).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('answers without creating or sending anything when the e-mail already has an account', async () => {
      const { service, users, codes, mail } = build();
      users.findByHandle.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(pendingUser);

      await expect(service.signup(signupInput)).resolves.toBeUndefined();
      expect(users.create).not.toHaveBeenCalled();
      expect(codes.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('creates a pending account and mails a six-digit code that matches the stored hash', async () => {
      const { service, users, codes, mail } = build();
      users.findByHandle.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue({ id: 'user-1' });

      await service.signup({ ...signupInput, phone: '06 12 34 56 78' } as SignupDto);

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          handle: 'alice',
          email: 'alice@example.test',
          phone: '0612345678',
          termsVersion: '1.0',
        }),
        expect.anything(),
      );
      const sent = mail.send.mock.calls[0][0] as { to: string; text: string };
      const code = /\b\d{6}\b/.exec(sent.text)?.[0];
      expect(sent.to).toBe('alice@example.test');
      expect(code).toBeDefined();
      expect(await verifyCode(codes.create.mock.calls[0][1].codeHash, code!)).toBe(true);
    });
  });

  describe('verify (B8, B10)', () => {
    async function withOpenCode(attempts = 0) {
      const built = build();
      built.users.findByEmail.mockResolvedValue(pendingUser);
      built.codes.findOpen.mockResolvedValue({ id: 'code-1', codeHash: await hashCode('123456'), attempts });
      built.codes.consume.mockResolvedValue(true);
      return built;
    }

    it('reserves the attempt before checking, and refuses a wrong code', async () => {
      const { service, codes, users } = await withOpenCode();

      await expect(service.verify({ email: 'alice@example.test', code: '654321' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(codes.reserveAttempt).toHaveBeenCalledWith(expect.anything(), 'code-1', 5, expect.any(Date));
      expect(users.activate).not.toHaveBeenCalled();
    });

    it('refuses the right code once the attempts are reserved up, without checking it', async () => {
      const { service, codes, ageVerifier } = await withOpenCode(5);
      codes.reserveAttempt.mockResolvedValue(false);

      await expect(service.verify({ email: 'alice@example.test', code: '123456' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(ageVerifier.check).not.toHaveBeenCalled();
    });

    it('activates the account and records the age check for an adult', async () => {
      const { service, codes, activation, users, ageVerifier } = await withOpenCode();
      ageVerifier.check.mockResolvedValue({
        provider: 'declared',
        status: 'verified',
        providerReference: null,
      });

      await expect(service.verify({ email: 'alice@example.test', code: '123456' })).resolves.toBeUndefined();
      expect(codes.consume).toHaveBeenCalledWith(expect.anything(), 'code-1', expect.any(Date));
      expect(activation.recordAgeCheck).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ status: 'verified' }),
        expect.any(Date),
      );
      expect(users.activate).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Date));
    });

    it('refuses an under-age account, records the refusal and does not activate it', async () => {
      const { service, activation, users, ageVerifier } = await withOpenCode();
      ageVerifier.check.mockResolvedValue({
        provider: 'declared',
        status: 'failed',
        providerReference: null,
      });

      await expect(service.verify({ email: 'alice@example.test', code: '123456' })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(activation.recordAgeCheck).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ status: 'failed' }),
        expect.any(Date),
      );
      expect(users.activate).not.toHaveBeenCalled();
    });
  });

  describe('resend (B9)', () => {
    it('sends nothing for an unknown e-mail', async () => {
      const { service, users, mail } = build();
      users.findByEmail.mockResolvedValue(null);

      await expect(service.resend({ email: 'nobody@example.test' })).resolves.toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('invalidates the open codes, stores a new one and mails it', async () => {
      const { service, users, codes, mail } = build();
      users.findByEmail.mockResolvedValue(pendingUser);

      await service.resend({ email: 'alice@example.test' });

      expect(codes.invalidateOpen).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Date));
      expect(codes.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('counts the request on the account id when the account exists (section 9.4)', async () => {
      const { service, users, codeRequests } = build();
      users.findByEmail.mockResolvedValue(pendingUser);

      await service.resend({ email: 'alice@example.test' });

      expect(codeRequests.allow).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('counts an unknown e-mail by the address, and sends nothing for it', async () => {
      const { service, users, codeRequests, codes } = build();
      users.findByEmail.mockResolvedValue(null);

      await service.resend({ email: 'nobody@example.test' });

      expect(codeRequests.allow).toHaveBeenCalledWith({ email: 'nobody@example.test' });
      expect(codes.invalidateOpen).not.toHaveBeenCalled();
    });

    it('invalidates nothing and sends nothing when the account is over its limit, and answers the same', async () => {
      const { service, users, codeRequests, codes, mail } = build();
      users.findByEmail.mockResolvedValue(pendingUser);
      codeRequests.allow.mockResolvedValue(false);

      await expect(service.resend({ email: 'alice@example.test' })).resolves.toBeUndefined();

      expect(codes.invalidateOpen).not.toHaveBeenCalled();
      expect(codes.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });
});
