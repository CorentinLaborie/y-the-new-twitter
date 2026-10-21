import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { verifyPassword } from '../password';
import { AccountDeletionRepository } from './account-deletion.repository';

/** The window between the request and the purge: 90 days (R16, DEC-024). */
export const DELETION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const NOT_LOGGED_IN = 'Vous devez être connecté.';
const WRONG_PASSWORD = 'Le mot de passe est incorrect.';

@Injectable()
export class AccountDeletionService {
  constructor(private readonly accounts: AccountDeletionRepository) {}

  /**
   * Starts the deletion window of an active account, after the current password is checked (R16). The account can
   * still log in during the window, which cancels the deletion (DEC-030).
   */
  async requestDeletion(userId: string, password: string, now: Date): Promise<void> {
    const account = await this.accounts.findAccount(userId);
    if (account === null || account.status !== 'active') {
      throw new UnauthorizedException(NOT_LOGGED_IN);
    }
    if (!(await verifyPassword(account.passwordHash, password))) {
      throw new UnprocessableEntityException(WRONG_PASSWORD);
    }

    const started = await this.accounts.startDeletion(
      userId,
      now,
      new Date(now.getTime() + DELETION_WINDOW_MS),
    );
    if (!started) {
      throw new UnauthorizedException(NOT_LOGGED_IN);
    }
  }
}
