import type { ConfigService } from '@nestjs/config';
import { hashBackupCode } from './backup-codes';
import { AdminMfaRepository } from './admin-mfa.repository';
import { AdminMfaService } from './admin-mfa.service';
import { TotpSecretCipher } from './totp-secret-cipher';
import { stepAt, totpCode } from './totp';

const KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
const BACKUP_KEY = 'unit-backup-key';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const STEP = stepAt(NOW.getTime());

describe('AdminMfaService', () => {
  const cipher = new TotpSecretCipher(KEY_BASE64);
  let repository: {
    findByUser: jest.Mock;
    enrol: jest.Mock;
    advanceStep: jest.Mock;
    consumeBackupCode: jest.Mock;
  };
  let service: AdminMfaService;

  beforeEach(() => {
    repository = {
      findByUser: jest.fn().mockResolvedValue(null),
      enrol: jest.fn().mockResolvedValue(undefined),
      advanceStep: jest.fn().mockResolvedValue(true),
      consumeBackupCode: jest.fn().mockResolvedValue(true),
    };
    const config = {
      getOrThrow: jest.fn((key: string) => (key === 'TOTP_ENCRYPTION_KEY' ? KEY_BASE64 : BACKUP_KEY)),
    };
    service = new AdminMfaService(
      config as unknown as ConfigService,
      repository as unknown as AdminMfaRepository,
    );
  });

  it('starts a set-up with a secret that only exists encrypted in the session value, and an authenticator URI', () => {
    const pending = service.startSetup('corentin');

    expect(pending.secretEncrypted).not.toContain(pending.secret);
    expect(cipher.decrypt(pending.secretEncrypted)).toBe(pending.secret);
    expect(pending.otpauthUri).toBe(
      `otpauth://totp/Y:corentin?secret=${pending.secret}&issuer=Y&algorithm=SHA1&digits=6&period=30`,
    );
    expect(repository.enrol).not.toHaveBeenCalled();
  });

  it('refuses a set-up code that is wrong, and enrols nothing', async () => {
    const pending = service.startSetup('corentin');

    await expect(service.confirmSetup('admin-1', pending.secretEncrypted, '000000', NOW)).resolves.toBeNull();
    expect(repository.enrol).not.toHaveBeenCalled();
  });

  it('enrols the encrypted secret and the hashed backup codes, and returns the codes in clear once', async () => {
    const pending = service.startSetup('corentin');
    const code = totpCode(pending.secret, STEP);

    const codes = await service.confirmSetup('admin-1', pending.secretEncrypted, code, NOW);

    expect(codes).toHaveLength(10);
    expect(repository.enrol).toHaveBeenCalledWith(
      'admin-1',
      pending.secretEncrypted,
      STEP,
      codes?.map((plain) => hashBackupCode(plain, BACKUP_KEY)),
    );
  });

  it('refuses a code when the account is not enrolled', async () => {
    await expect(service.verifyCode('admin-1', '123456', NOW)).resolves.toBe(false);
    expect(repository.advanceStep).not.toHaveBeenCalled();
  });

  it('accepts the current TOTP code and moves the last used step forward', async () => {
    const secret = service.startSetup('corentin').secret;
    repository.findByUser.mockResolvedValue({
      totpSecretEncrypted: cipher.encrypt(secret),
      lastUsedStep: null,
    });

    await expect(service.verifyCode('admin-1', totpCode(secret, STEP), NOW)).resolves.toBe(true);
    expect(repository.advanceStep).toHaveBeenCalledWith('admin-1', STEP);
  });

  it('refuses a TOTP code whose step was already used (replay)', async () => {
    const secret = service.startSetup('corentin').secret;
    repository.findByUser.mockResolvedValue({
      totpSecretEncrypted: cipher.encrypt(secret),
      lastUsedStep: BigInt(STEP),
    });

    await expect(service.verifyCode('admin-1', totpCode(secret, STEP), NOW)).resolves.toBe(false);
    expect(repository.advanceStep).not.toHaveBeenCalled();
  });

  it('refuses a TOTP code when the step is taken by a concurrent request', async () => {
    const secret = service.startSetup('corentin').secret;
    repository.findByUser.mockResolvedValue({
      totpSecretEncrypted: cipher.encrypt(secret),
      lastUsedStep: null,
    });
    repository.advanceStep.mockResolvedValue(false);

    await expect(service.verifyCode('admin-1', totpCode(secret, STEP), NOW)).resolves.toBe(false);
  });

  it('refuses a wrong six-digit code without touching the step', async () => {
    const secret = service.startSetup('corentin').secret;
    repository.findByUser.mockResolvedValue({
      totpSecretEncrypted: cipher.encrypt(secret),
      lastUsedStep: null,
    });
    const wrong = totpCode(secret, STEP) === '000000' ? '111111' : '000000';

    await expect(service.verifyCode('admin-1', wrong, NOW)).resolves.toBe(false);
    expect(repository.advanceStep).not.toHaveBeenCalled();
  });

  it('accepts a backup code by its hash, and asks the repository to consume it once', async () => {
    await expect(service.verifyCode('admin-1', 'abcde-fghjk', NOW)).resolves.toBe(true);
    expect(repository.consumeBackupCode).toHaveBeenCalledWith(
      'admin-1',
      hashBackupCode('abcde-fghjk', BACKUP_KEY),
    );
    expect(repository.findByUser).not.toHaveBeenCalled();
  });
});
