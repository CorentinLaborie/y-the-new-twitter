import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MAIL_SENDER, type MailSender } from '../../common/mail/mail-sender';
import type { SessionUser } from '../session/session-user.repository';
import { ACCOUNT_NOT_ACTIVE_MESSAGE } from '../../users/users.repository';
import { hashPassword, isPasswordAllowed, PASSWORD_REFUSED, verifyPassword } from '../password';
import { passwordChangedMail } from '../password-reset/password-reset-mail';
import { PasswordChangeDto } from './dto/password-change.dto';
import { PasswordChangeDb, PasswordChangeRepository } from './password-change.repository';

const CURRENT_PASSWORD_WRONG = 'Le mot de passe est incorrect.';

/**
 * Changes the password of the signed-in account (plan L5, step 3). The policy is checked first, then the current
 * password, under the account lock. The other sessions are closed; the current one stays open (decision 1). A new
 * password equal to the old one is accepted (decision 2). The notice goes out after the commit.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly passwords: PasswordChangeRepository,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  async change(viewer: SessionUser, sessionId: string, dto: PasswordChangeDto): Promise<void> {
    if (!isPasswordAllowed(dto.newPassword)) {
      throw new UnprocessableEntityException(PASSWORD_REFUSED);
    }

    const email = await this.passwords.transaction(async (db) => {
      await this.lockActiveAccount(db, viewer.id);
      const credentials = await this.passwords.findCredentials(db, viewer.id);
      if (credentials === null || !(await verifyPassword(credentials.passwordHash, dto.currentPassword))) {
        throw new UnprocessableEntityException(CURRENT_PASSWORD_WRONG);
      }

      const passwordHash = await hashPassword(dto.newPassword);
      await this.passwords.replacePassword(db, viewer.id, passwordHash, sessionId);

      return credentials.email;
    });

    await this.mail.send(passwordChangedMail(email));
  }

  /** Refuses an account that stopped being active during the request (R13). */
  private async lockActiveAccount(db: PasswordChangeDb, userId: string): Promise<void> {
    if ((await this.passwords.lockAccount(db, userId)) !== 'active') {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
  }
}
