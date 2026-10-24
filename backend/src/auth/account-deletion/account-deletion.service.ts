import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { deletionReasonText } from '../../admin/users/account-deletion-reasons';
import { MAIL_SENDER, type MailSender } from '../../common/mail/mail-sender';
import { verifyPassword } from '../password';
import { AccountDeletionRepository } from './account-deletion.repository';
import { deletionRequestedMail } from './account-deletion-mail';
import type { AccountDeletionDto } from './dto/account-deletion.dto';

/** The window between the request and the purge: 90 days (R16, DEC-024). */
export const DELETION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const NOT_LOGGED_IN = 'Vous devez être connecté.';
const WRONG_PASSWORD = 'Le mot de passe est incorrect.';

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly accounts: AccountDeletionRepository,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  /**
   * Starts the deletion window of an active account, after the current password is checked (R16). The reason and the
   * e-mail are kept with the deletion; the mail goes to the address typed, after the commit. The account can still log
   * in during the window, which cancels the deletion (DEC-030). Returns the purge date.
   */
  async requestDeletion(userId: string, dto: AccountDeletionDto, now: Date): Promise<Date> {
    const account = await this.accounts.findAccount(userId);
    if (account === null || account.status !== 'active') {
      throw new UnauthorizedException(NOT_LOGGED_IN);
    }
    if (!(await verifyPassword(account.passwordHash, dto.password))) {
      throw new UnprocessableEntityException(WRONG_PASSWORD);
    }

    const purgeAt = new Date(now.getTime() + DELETION_WINDOW_MS);
    const started = await this.accounts.startDeletion(userId, now, purgeAt, {
      reason: deletionReasonText(dto.reasonCode, dto.otherReason),
      email: dto.email,
    });
    if (!started) {
      throw new UnauthorizedException(NOT_LOGGED_IN);
    }

    await this.mail.send(deletionRequestedMail(dto.email, purgeAt));
    return purgeAt;
  }
}
