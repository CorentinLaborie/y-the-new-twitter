import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import { lockAccountGraphExclusive, lockAccountGraphShared } from './account-graph-lock';
import { recalculateCounters } from './recalculate-counters';

/** The Prisma client or a transaction opened by a caller. */
type UsersDb = Prisma.TransactionClient;

/** The refusal of a write made for an account that stopped being active during the request (R13). */
export const ACCOUNT_NOT_ACTIVE_MESSAGE = 'Votre compte n’est plus actif.';

interface NewUser {
  handle: string;
  displayName: string;
  email: string;
  passwordHash: string;
  birthDate: Date;
  phone: string | null;
  termsAcceptedAt: Date;
  termsVersion: string;
}

/** The only place that reads and writes the `users` table for the account flows (section 8.2). */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** E-mail addresses are stored in lower case (section 9.1). */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /** The e-mail address of an account, for the messages the server sends to it. Null when there is no such account. */
  async emailOf(id: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    return user?.email ?? null;
  }

  async handleOf(id: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { handle: true } });
    return user?.handle ?? null;
  }

  /** The account as the settings page shows it: the e-mail and the purge date are not in the session (plan L5, 4). */
  findAccountSettings(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { handle: true, displayName: true, email: true, status: true, deletionPurgeAt: true },
    });
  }

  /** Handles are unique regardless of case (DEC-061). */
  findByHandle(handle: string) {
    return this.prisma.user.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' } },
    });
  }

  create(user: NewUser, db: UsersDb = this.prisma) {
    return db.user.create({
      data: {
        handle: user.handle,
        displayName: user.displayName,
        email: user.email.toLowerCase(),
        passwordHash: user.passwordHash,
        birthDate: user.birthDate,
        phone: user.phone,
        status: 'pending_verification',
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
      },
    });
  }

  /**
   * Locks the account row, shared, until the caller's transaction ends. Returns false unless the account is active.
   * A write that moves a counter for this account takes this lock first, before the question or reply lock: a status
   * change waits for it, and it waits for a status change, so no counter is left with an inactive account counted (R13).
   */
  async lockActiveAccount(db: UsersDb, userId: string): Promise<boolean> {
    await lockAccountGraphShared(db);
    const rows = await db.$queryRaw<{ status: AccountStatus }[]>`
      SELECT status FROM users WHERE id = ${userId}::uuid FOR SHARE`;

    return rows[0]?.status === 'active';
  }

  /** Runs a unit of work in one transaction, for the account flows that lock rows before they write. */
  transaction<T>(run: (db: UsersDb) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(run);
  }

  /** The account, other than `exceptId`, that already uses this handle, whatever its case (DEC-061). */
  findOtherHandleOwner(db: UsersDb, handle: string, exceptId: string) {
    return db.user.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' }, id: { not: exceptId } },
      select: { id: true },
    });
  }

  /** Writes the profile fields that are given. An absent field is left unchanged; a null bio clears it (plan L1, 1.2). */
  updateProfile(
    db: UsersDb,
    userId: string,
    fields: { handle?: string; displayName?: string; bio?: string | null },
  ) {
    return db.user.update({
      where: { id: userId },
      data: fields,
      select: { handle: true, displayName: true, bio: true },
    });
  }

  /** Moves the account to active once its e-mail is verified (section 3.2), and recalculates its counters (R13). */
  async activate(db: UsersDb, userId: string, at: Date) {
    await lockAccountGraphExclusive(db);
    const user = await db.user.update({
      where: { id: userId },
      data: { status: 'active', emailVerifiedAt: at, statusChangedAt: at },
    });
    await recalculateCounters(db, userId);

    return user;
  }

  /**
   * Cancels a pending deletion (R16, DEC-030): the account is active again, and its counters count again. Only an
   * account whose 90-day window is still open is changed. False when it is not, so the login is refused.
   */
  cancelDeletion(userId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await lockAccountGraphExclusive(tx);
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          status: 'pending_deletion',
          deletionPurgeAt: { gt: now },
          // Only a deletion the user asked for: an administrator's deletion is not cancelled by a login (R16).
          deletionOrigin: 'user',
        },
        data: {
          status: 'active',
          statusChangedAt: now,
          deletionRequestedAt: null,
          deletionPurgeAt: null,
          deletionOrigin: null,
        },
      });
      if (result.count !== 1) {
        return false;
      }

      await recalculateCounters(tx, userId);
      return true;
    });
  }
}
