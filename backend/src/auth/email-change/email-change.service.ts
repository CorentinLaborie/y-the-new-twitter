import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_SENDER, type MailSender } from '../../common/mail/mail-sender';
import { UsersRepository } from '../../users/users.repository';
import { CodeRequestLimitService } from '../rate-limit/code-request-limit.service';
import { generateCode, hashCode, verifyCode } from '../verification-code';
import { addressChangedMail, newAddressCodeMail } from './email-change-mail';
import { EmailChangeCodesRepository } from './email-change-codes.repository';

const NOT_LOGGED_IN = 'Vous devez être connecté.';
const INVALID_CODE = 'Le code est incorrect ou a expiré.';
const ADDRESS_TAKEN = 'Cette adresse e-mail est déjà utilisée.';

@Injectable()
export class EmailChangeService {
  constructor(
    private readonly users: UsersRepository,
    private readonly codes: EmailChangeCodesRepository,
    private readonly codeRequests: CodeRequestLimitService,
    private readonly config: ConfigService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  /**
   * Sends a code to the new address only when no account uses it, it differs from the current one, and the account
   * is under its code request limit (section 9.4). The code is hashed in every case, so the answer takes the same
   * time. The caller always answers 202.
   */
  async requestChange(userId: string, newEmail: string): Promise<void> {
    const account = await this.activeAccount(userId);
    const code = generateCode();
    const codeHash = await hashCode(code);
    const allowed = await this.codeRequests.allow({ userId });

    if (!allowed || newEmail === account.email || (await this.users.findByEmail(newEmail))) {
      return;
    }

    await this.codes.replaceOpenCode(userId, newEmail, codeHash, this.expiresAt());
    await this.mail.send(newAddressCodeMail(newEmail, code, this.ttlMinutes()));
  }

  /**
   * Five attempts at most, one use only. The address is switched in a transaction, then the former
   * address is told about it. The current address is kept when the code is wrong.
   */
  async confirmChange(userId: string, code: string): Promise<void> {
    const account = await this.activeAccount(userId);

    const openCode = await this.codes.findOpenCode(userId);
    if (
      !openCode ||
      !(await this.codes.reserveAttempt(openCode.id)) ||
      !(await verifyCode(openCode.codeHash, code))
    ) {
      throw new UnprocessableEntityException(INVALID_CODE);
    }

    const outcome = await this.codes.completeChange(openCode.id, userId, openCode.newEmail);
    if (outcome === 'code-used') {
      throw new UnprocessableEntityException(INVALID_CODE);
    }
    if (outcome === 'taken') {
      throw new ConflictException(ADDRESS_TAKEN);
    }

    await this.mail.send(addressChangedMail(account.email));
  }

  /** The session user must still be an active account (the guard checks it too; the service needs the row). */
  private async activeAccount(userId: string): Promise<{ email: string }> {
    const account = await this.codes.findAccount(userId);
    if (!account || account.status !== 'active') {
      throw new UnauthorizedException(NOT_LOGGED_IN);
    }

    return account;
  }

  private ttlMinutes(): number {
    return this.config.getOrThrow<number>('Y_CODE_TTL_MINUTES');
  }

  private expiresAt(): Date {
    return new Date(Date.now() + this.ttlMinutes() * 60_000);
  }
}
