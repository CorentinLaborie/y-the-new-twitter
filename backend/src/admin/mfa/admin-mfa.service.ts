import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminMfaRepository } from './admin-mfa.repository';
import { generateBackupCodes, hashBackupCode, isBackupCodeInput } from './backup-codes';
import { TotpSecretCipher } from './totp-secret-cipher';
import { generateTotpSecret, totpUri, verifyTotp } from './totp';

/** Issuer shown by the authenticator application next to the code. */
const TOTP_ISSUER = 'Y';

export interface PendingFactor {
  /** The secret, shown once so the user can type it into the authenticator application. */
  readonly secret: string;
  /** The same secret, encrypted for the session until the first code is confirmed (DEC-107). */
  readonly secretEncrypted: string;
  readonly otpauthUri: string;
}

/**
 * The second factor of the back-office (DEC-036, DEC-082): a TOTP secret stored encrypted, ten single-use backup
 * codes stored as HMAC hashes (DEC-114), and the rule that a code is accepted once.
 */
@Injectable()
export class AdminMfaService {
  private readonly cipher: TotpSecretCipher;
  private readonly backupCodeKey: string;

  constructor(
    config: ConfigService,
    private readonly repository: AdminMfaRepository,
  ) {
    this.cipher = new TotpSecretCipher(config.getOrThrow<string>('TOTP_ENCRYPTION_KEY'));
    this.backupCodeKey = config.getOrThrow<string>('BACKUP_CODE_HMAC_KEY');
  }

  async isEnrolled(userId: string): Promise<boolean> {
    return (await this.repository.findByUser(userId)) !== null;
  }

  /** A new secret for the set-up. Nothing is stored until confirmSetup. */
  startSetup(account: string): PendingFactor {
    const secret = generateTotpSecret();

    return {
      secret,
      secretEncrypted: this.cipher.encrypt(secret),
      otpauthUri: totpUri({ secretBase32: secret, issuer: TOTP_ISSUER, account }),
    };
  }

  /**
   * Checks the first code against the pending secret. On success, enrols the factor and its backup codes, and returns
   * the codes in clear: they are shown once and never stored in clear. Null when the code is wrong.
   */
  async confirmSetup(
    userId: string,
    secretEncrypted: string,
    code: string,
    now: Date,
  ): Promise<string[] | null> {
    const step = verifyTotp(this.cipher.decrypt(secretEncrypted), code.trim(), now.getTime(), null);
    if (step === null) {
      return null;
    }

    const codes = generateBackupCodes();
    await this.repository.enrol(
      userId,
      secretEncrypted,
      step,
      codes.map((plain) => hashBackupCode(plain, this.backupCodeKey)),
    );

    return codes;
  }

  /** Checks a TOTP code or a backup code of an enrolled account. Each code is accepted once. */
  async verifyCode(userId: string, code: string, now: Date): Promise<boolean> {
    const input = code.trim();
    if (isBackupCodeInput(input)) {
      return this.repository.consumeBackupCode(userId, hashBackupCode(input, this.backupCodeKey));
    }

    const factor = await this.repository.findByUser(userId);
    if (factor === null) {
      return false;
    }

    const step = verifyTotp(
      this.cipher.decrypt(factor.totpSecretEncrypted),
      input,
      now.getTime(),
      factor.lastUsedStep === null ? null : Number(factor.lastUsedStep),
    );

    return step !== null && (await this.repository.advanceStep(userId, step));
  }
}
