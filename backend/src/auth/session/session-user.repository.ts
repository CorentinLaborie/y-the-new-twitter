import { Injectable } from '@nestjs/common';
import type { AccountStatus, UserRole } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** The logged-in user as the server knows it. Never includes the e-mail address or the password hash. */
export interface SessionUser {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
}

/** Loads the user of a session. A deleted account is never returned, even when its session row is still alive. */
@Injectable()
export class SessionUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<SessionUser | null> {
    return this.prisma.user.findFirst({
      where: { id, status: { not: 'deleted' } },
      select: { id: true, handle: true, displayName: true, role: true, status: true },
    });
  }
}
