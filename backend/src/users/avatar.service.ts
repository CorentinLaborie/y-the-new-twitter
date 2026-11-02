import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { AvatarStorage } from './avatar.storage';
import { ACCOUNT_NOT_ACTIVE_MESSAGE, UsersRepository } from './users.repository';

/** The profile photo is at most 2 MB (plan L1, decision 0.2). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const FORMAT_REFUSED = 'La photo doit être au format JPEG, PNG ou WebP.';
const TOO_LARGE = 'La photo ne doit pas dépasser 2 Mo.';

/** The extension of a photo whose first bytes match an accepted format, or null. */
function extensionOf(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return '.jpg';
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return '.webp';
  }

  return null;
}

/** Sets and removes the profile photo of the signed-in account (plan L1, step 2). Only an active account may (R13). */
@Injectable()
export class AvatarService {
  constructor(
    private readonly users: UsersRepository,
    private readonly storage: AvatarStorage,
  ) {}

  /** Stores the photo and records its address; the previous file is removed once the new one is recorded. */
  async upload(viewer: SessionUser, bytes: Buffer): Promise<string> {
    if (bytes.length > AVATAR_MAX_BYTES) {
      throw new PayloadTooLargeException(TOO_LARGE);
    }
    const extension = extensionOf(bytes);
    if (extension === null) {
      throw new BadRequestException(FORMAT_REFUSED);
    }

    const { url, previous } = await this.users.transaction(async (db) => {
      await this.requireActive(db, viewer.id);
      const previous = await this.users.avatarUrlOf(db, viewer.id);
      const url = await this.storage.save(bytes, extension);
      await this.users.setAvatarUrl(db, viewer.id, url);

      return { url, previous };
    });

    if (previous !== null) {
      await this.storage.remove(previous);
    }

    return url;
  }

  /** Clears the photo address and removes its file: the default photo is shown again. */
  async remove(viewer: SessionUser): Promise<void> {
    const previous = await this.users.transaction(async (db) => {
      await this.requireActive(db, viewer.id);
      const previous = await this.users.avatarUrlOf(db, viewer.id);
      await this.users.setAvatarUrl(db, viewer.id, null);

      return previous;
    });

    if (previous !== null) {
      await this.storage.remove(previous);
    }
  }

  private async requireActive(
    db: Parameters<UsersRepository['lockActiveAccount']>[0],
    userId: string,
  ): Promise<void> {
    if (!(await this.users.lockActiveAccount(db, userId))) {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
  }
}
