import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../database/generated/client/client';
import type { SessionUser } from '../auth/session/session-user.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ACCOUNT_NOT_ACTIVE_MESSAGE, UsersRepository } from './users.repository';

const HANDLE_TAKEN = 'Ce pseudo est déjà pris.';

/** The profile fields after an edit, as the profile shows them. */
export interface ProfileFields {
  handle: string;
  displayName: string;
  bio: string | null;
}

/** Edits the signed-in account's profile (plan L1, 1.2). Only an active account may change it (R13). */
@Injectable()
export class ProfileService {
  constructor(private readonly users: UsersRepository) {}

  async update(viewer: SessionUser, dto: UpdateProfileDto): Promise<ProfileFields> {
    return this.users.transaction(async (db) => {
      if (!(await this.users.lockActiveAccount(db, viewer.id))) {
        throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
      }

      if (
        dto.handle !== undefined &&
        (await this.users.findOtherHandleOwner(db, dto.handle, viewer.id)) !== null
      ) {
        throw new ConflictException(HANDLE_TAKEN);
      }

      try {
        return await this.users.updateProfile(db, viewer.id, dto);
      } catch (error) {
        // A handle taken between the check and the write is still refused by the unique index.
        if (isUniqueViolation(error)) {
          throw new ConflictException(HANDLE_TAKEN);
        }

        throw error;
      }
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
