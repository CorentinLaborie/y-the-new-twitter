import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_SENDER, type MailSender } from '../../common/mail/mail-sender';
import { UsersRepository } from '../../users/users.repository';
import { CodeRequestLimitService } from '../rate-limit/code-request-limit.service';
import { hashPassword, isPasswordAllowed, PASSWORD_REFUSED } from '../password';
import { generateCode, hashCode, verifyCode } from '../verification-code';
import { PasswordResetCodesRepository } from './password-reset-codes.repository';
import { passwordChangedMail, resetCodeMail } from './password-reset-mail';

const INVALID_CODE = 'Le code est incorrect ou a expiré.';

interface PasswordResetInput {
  email: string;
  code: string;
  password: string;
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly users: UsersRepository,
    private readonly codes: PasswordResetCodesRepository,
    private readonly codeRequests: CodeRequestLimitService,
    private readonly config: ConfigService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  /**
   * Sends a code only when an active account has this address, and when the account is under its code request
   * limit (section 9.4). The request is counted in every case. The code is hashed in every case, so an unknown
   * address takes as long as a known one. The caller always answers 202.
   */
  async requestCode(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    const code = generateCode();
    const codeHash = await hashCode(code);
    const allowed = await this.codeRequests.allow(user ? { userId: user.id } : { email });

    if (!user || user.status !== 'active' || !allowed) {
      return;
    }

    await this.codes.replaceOpenCode(user.id, codeHash, this.expiresAt());
    await this.mail.send(resetCodeMail(user.email, code, this.ttlMinutes()));
  }

  /**
   * Checks the password policy first (it burns no attempt), then the code: five attempts at most, one
   * use only. The password is replaced and every session of the user is closed in one transaction.
   */
  async confirmReset(input: PasswordResetInput): Promise<void> {
    if (!isPasswordAllowed(input.password)) {
      throw new UnprocessableEntityException(PASSWORD_REFUSED);
    }

    const user = await this.users.findByEmail(input.email);
    if (!user || user.status !== 'active') {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    const openCode = await this.codes.findOpenCode(user.id);
    if (
      !openCode ||
      !(await this.codes.reserveAttempt(openCode.id)) ||
      !(await verifyCode(openCode.codeHash, input.code))
    ) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    const passwordHash = await hashPassword(input.password);
    if (!(await this.codes.completeReset(openCode.id, user.id, passwordHash))) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    await this.mail.send(passwordChangedMail(user.email));
  }

  private ttlMinutes(): number {
    return this.config.getOrThrow<number>('Y_CODE_TTL_MINUTES');
  }

  private expiresAt(): Date {
    return new Date(Date.now() + this.ttlMinutes() * 60_000);
  }
}
