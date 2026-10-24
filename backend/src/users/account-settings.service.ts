import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { AccountSettingsDto } from './dto/account-settings.dto';
import { UsersRepository } from './users.repository';

const ACCOUNT_NOT_FOUND = 'Compte introuvable.';

/** Reads the account of the signed-in viewer for the settings page (plan L5, step 2). */
@Injectable()
export class AccountSettingsService {
  constructor(private readonly users: UsersRepository) {}

  async read(viewer: SessionUser): Promise<AccountSettingsDto> {
    const account = await this.users.findAccountSettings(viewer.id);
    if (account === null) {
      throw new NotFoundException(ACCOUNT_NOT_FOUND);
    }

    return account;
  }
}
