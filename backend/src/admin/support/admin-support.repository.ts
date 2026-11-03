import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../../common/pagination/keyset-cursor';
import { Prisma, type SupportStatus } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuditDb } from '../audit/audit-log.repository';

const ACCOUNT_SELECT = {
  id: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  email: true,
  status: true,
  createdAt: true,
  statusChangedAt: true,
  suspensionReason: true,
} as const;

const THREAD_SELECT = {
  id: true,
  reference: true,
  status: true,
  createdAt: true,
  closedAt: true,
  closedByLift: true,
  user: { select: ACCOUNT_SELECT },
} satisfies Prisma.SupportThreadSelect;

/** A thread of the list, with the latest message its account wrote (none when there is no such message). */
export type SupportThreadListRow = Prisma.SupportThreadGetPayload<{
  select: typeof THREAD_SELECT & {
    messages: { select: { body: true; sentAt: true } };
  };
}>;

/** A thread with all its messages. */
export type SupportThreadRow = Prisma.SupportThreadGetPayload<{
  select: typeof THREAD_SELECT & {
    messages: { select: { id: true; authorType: true; body: true; sentAt: true } };
  };
}>;

/** One answer of an administrator, as the repository writes it. The rules that choose it are in the service. */
export interface SupportReplyWrite {
  threadId: string;
  adminId: string;
  body: string;
  now: Date;
  /** Writes the audit entry inside the same transaction: if it fails, the answer is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/** The closing of a thread by an administrator, as the repository writes it. */
export interface SupportCloseWrite {
  threadId: string;
  adminId: string;
  now: Date;
  /** Writes the audit entry inside the same transaction: if it fails, the closing is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/** The statuses of an open thread: a message of the account puts it back to `new`, an answer makes it `replied`. */
const OPEN_STATUSES: SupportStatus[] = ['new', 'replied'];

/**
 * The back-office reads and writes of the contact threads (section 3.4, DEC-116). The thread table is shared with the
 * account side, which opens and reopens the threads; this repository only answers and closes them.
 */
@Injectable()
export class AdminSupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A page of threads, newest first, strictly after `after` when it is given, of the given statuses. */
  page(options: {
    after?: KeysetPosition;
    limit: number;
    statuses?: SupportStatus[];
  }): Promise<SupportThreadListRow[]> {
    const conditions: Prisma.SupportThreadWhereInput[] = [];
    if (options.statuses !== undefined) {
      conditions.push({ status: { in: options.statuses } });
    }
    if (options.after !== undefined) {
      const { createdAt, id } = options.after;
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }

    return this.prisma.supportThread.findMany({
      where: { AND: conditions },
      select: {
        ...THREAD_SELECT,
        messages: {
          where: { authorType: 'user' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { body: true, sentAt: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
    });
  }

  findById(id: string): Promise<SupportThreadRow | null> {
    return this.prisma.supportThread.findUnique({
      where: { id },
      select: {
        ...THREAD_SELECT,
        messages: {
          orderBy: { sentAt: 'asc' },
          select: { id: true, authorType: true, body: true, sentAt: true },
        },
      },
    });
  }

  /**
   * Writes an answer in one transaction: the thread becomes `replied`, the message is stored, and the audit entry is
   * written. False, with no write, when the thread is closed (or was closed meanwhile).
   */
  reply(change: SupportReplyWrite): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.supportThread.updateMany({
        where: { id: change.threadId, status: { in: OPEN_STATUSES } },
        data: { status: 'replied' },
      });
      if (result.count !== 1) {
        return false;
      }

      await tx.supportMessage.create({
        data: {
          threadId: change.threadId,
          authorType: 'admin',
          authorUserId: change.adminId,
          body: change.body,
          channel: 'email',
        },
      });
      await change.record(tx);
      return true;
    });
  }

  /**
   * Closes an open thread in one transaction, and writes the audit entry. The account can write a new thread afterwards,
   * so the open slot of the account is freed. False, with no write, when the thread is already closed.
   */
  close(change: SupportCloseWrite): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.supportThread.updateMany({
        where: { id: change.threadId, status: { in: OPEN_STATUSES } },
        data: {
          status: 'closed',
          closedAt: change.now,
          closedById: change.adminId,
          closedByLift: false,
          openUserId: null,
        },
      });
      if (result.count !== 1) {
        return false;
      }

      await change.record(tx);
      return true;
    });
  }
}
