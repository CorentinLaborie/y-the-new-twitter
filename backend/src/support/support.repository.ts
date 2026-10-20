import { Injectable } from '@nestjs/common';
import type { AccountStatus, Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by the service. */
export type SupportDb = Prisma.TransactionClient;

/** Key of the advisory lock that serialises the numbering of the contact references (DEC-080). */
const REFERENCE_LOCK_KEY = 'support_threads.reference';

/** The only place that reads and writes the contact tables `support_threads` and `support_messages` (section 8.2). */
@Injectable()
export class SupportRepository {
  /** Locks the account row until the transaction ends, and returns its status. Two messages of one account run one at a time. */
  async lockAccountStatus(db: SupportDb, userId: string): Promise<AccountStatus | null> {
    const rows = await db.$queryRaw<{ status: AccountStatus }[]>`
      SELECT status FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

    return rows[0]?.status ?? null;
  }

  /** Serialises the numbering of the references until the transaction ends, so two threads never get the same number. */
  async lockReferenceNumbering(db: SupportDb): Promise<void> {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REFERENCE_LOCK_KEY}))`;
  }

  /** The open thread of the account: status `new` or `replied`. A closed thread is never reopened (DEC-116). */
  findOpenThread(db: SupportDb, userId: string) {
    return db.supportThread.findFirst({
      where: { userId, status: { in: ['new', 'replied'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true },
    });
  }

  /** The greatest reference that starts with `prefix` (one day), or null when the day has no thread yet. */
  async findLastReference(db: SupportDb, prefix: string): Promise<string | null> {
    const thread = await db.supportThread.findFirst({
      where: { reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    return thread?.reference ?? null;
  }

  createThread(db: SupportDb, reference: string, userId: string) {
    return db.supportThread.create({
      data: { reference, userId, status: 'new', openUserId: userId },
      select: { id: true, reference: true },
    });
  }

  /** A new message puts the thread back to `new` (DEC-116, case 1). The write also moves its update date. */
  markNew(db: SupportDb, threadId: string, userId: string) {
    return db.supportThread.update({
      where: { id: threadId },
      data: { status: 'new', openUserId: userId },
    });
  }

  createUserMessage(db: SupportDb, threadId: string, authorUserId: string, body: string) {
    return db.supportMessage.create({
      data: { threadId, authorType: 'user', authorUserId, body },
    });
  }
}
