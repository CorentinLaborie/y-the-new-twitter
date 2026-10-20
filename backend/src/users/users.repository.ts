import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';

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
    const rows = await db.$queryRaw<{ status: AccountStatus }[]>`
      SELECT status FROM users WHERE id = ${userId}::uuid FOR SHARE`;

    return rows[0]?.status === 'active';
  }

  /** Moves the account to active once its e-mail is verified (section 3.2), and recalculates its counters (R13). */
  async activate(db: UsersDb, userId: string, at: Date) {
    const user = await db.user.update({
      where: { id: userId },
      data: { status: 'active', emailVerifiedAt: at, statusChangedAt: at },
    });
    await this.recalculateCounters(db, userId);

    return user;
  }

  /**
   * Brings the counters that depend on this account back to what the active accounts give (R13): the Y, like and
   * dislike counts of the questions and the reply count of the questions this account reacted to or replied under,
   * and the like and dislike counts of the replies it reacted to. Only active accounts are counted, and deleted
   * replies are not. Every status change calls it in the same transaction, after writing the new status.
   */
  async recalculateCounters(db: UsersDb, userId: string): Promise<void> {
    // Replies first, then questions: a reply deletion locks its reply, then its question, and the recalculation
    // takes the rows in the same order, so the two cannot wait for each other.
    await db.$executeRaw`
      UPDATE replies AS rp SET
        like_count = (SELECT count(*) FROM reply_reactions r JOIN users u ON u.id = r.user_id
                      WHERE r.reply_id = rp.id AND r.kind = 'like' AND u.status = 'active'),
        dislike_count = (SELECT count(*) FROM reply_reactions r JOIN users u ON u.id = r.user_id
                         WHERE r.reply_id = rp.id AND r.kind = 'dislike' AND u.status = 'active')
      WHERE rp.id IN (SELECT reply_id FROM reply_reactions WHERE user_id = ${userId}::uuid)`;
    await db.$executeRaw`
      UPDATE questions AS q SET
        like_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                      WHERE r.question_id = q.id AND r.kind = 'like' AND u.status = 'active'),
        dislike_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                         WHERE r.question_id = q.id AND r.kind = 'dislike' AND u.status = 'active'),
        y_count = (SELECT count(*) FROM question_reactions r JOIN users u ON u.id = r.user_id
                   WHERE r.question_id = q.id AND r.kind = 'y' AND u.status = 'active'),
        reply_count = (SELECT count(*) FROM replies rp JOIN users u ON u.id = rp.author_id
                       WHERE rp.question_id = q.id AND rp.deleted_at IS NULL AND u.status = 'active')
      WHERE q.id IN (
        SELECT question_id FROM question_reactions WHERE user_id = ${userId}::uuid
        UNION
        SELECT question_id FROM replies WHERE author_id = ${userId}::uuid)`;
  }
}
