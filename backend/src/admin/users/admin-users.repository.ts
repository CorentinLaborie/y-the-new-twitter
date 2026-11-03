import { ConflictException, Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../../common/pagination/keyset-cursor';
import { AccountStatus, DeletionOrigin, Prisma, UserRole } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import { lockAccountGraphExclusive } from '../../users/account-graph-lock';
import { recalculateCounters } from '../../users/recalculate-counters';
import type { AuditDb } from '../audit/audit-log.repository';
import type { ContactThreadPlan, ContactThreadState, RequestedAccountStatus } from './status-change';

/** One status change, as the repository writes it. The rules that choose it are in the service. */
export interface StatusChangeWrite {
  userId: string;
  /** The status the change was decided from. The write only applies while the account still has it (no lost update). */
  expectedStatus: AccountStatus;
  status: RequestedAccountStatus;
  /** The suspension reason, kept while the account is suspended. Null when the suspension is lifted. */
  reason: string | null;
  now: Date;
  /** The administrator who makes the change: the one who closes a contact thread by lifting (DEC-116). */
  closedById: string;
  thread: ContactThreadPlan | null;
  /** Writes the audit entries inside the same transaction: if it fails, the status change is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/** One deletion window started by an administrator, as the repository writes it. */
export interface DeletionWrite {
  userId: string;
  now: Date;
  /** The end of the window: the purge erases the account from this date (R16). */
  purgeAt: Date;
  /** Who started the deletion: a login cancels only the user's own (R16, DEC-030). */
  origin: DeletionOrigin;
  /** The administrator who starts the deletion. */
  actorId: string;
  /** The open contact thread, closed with the deletion (no e-mail, not a lifting: DEC-116). Null when there is none. */
  thread: ContactThreadPlan | null;
  /** Writes the audit entry inside the same transaction: if it fails, the deletion is rolled back. */
  record: (db: AuditDb) => Promise<void>;
}

/** A row of the account search, as the database returns it. */
export interface AccountRow {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  status: AccountStatus;
  role: UserRole;
  createdAt: Date;
}

/** The fields of one account, for its view. */
export type AccountDetails = AccountRow & {
  statusChangedAt: Date | null;
  suspensionReason: string | null;
};

/** The activity figures of one account, counted when the view is read. */
export interface AccountActivity {
  lastLoginAt: Date | null;
  activeSessionCount: number;
  reports: { total: number; open: number };
  moderatedContentCount: number;
}

/**
 * The back-office reads of the accounts (DEC-035, section 3.3). It only reads: status changes go through the users
 * repository, which holds their rules.
 */
@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A page of accounts, newest first, strictly after `after` when it is given. */
  page(options: {
    after?: KeysetPosition;
    limit: number;
    q?: string;
    status?: AccountStatus;
  }): Promise<AccountRow[]> {
    const conditions: Prisma.UserWhereInput[] = [];
    if (options.q !== undefined) {
      conditions.push({
        OR: [{ handle: { contains: options.q, mode: 'insensitive' } }, { email: options.q.toLowerCase() }],
      });
    }
    if (options.status !== undefined) {
      conditions.push({ status: options.status });
    }
    if (options.after !== undefined) {
      const { createdAt, id } = options.after;
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }

    return this.prisma.user.findMany({
      where: { AND: conditions },
      select: ACCOUNT_ROW_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
    });
  }

  findById(id: string): Promise<AccountDetails | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...ACCOUNT_ROW_SELECT, statusChangedAt: true, suspensionReason: true },
    });
  }

  /** The contact thread a status change decides about: the open one, or the one a lifting closed (DEC-116). */
  contactThreadOf(userId: string): Promise<ContactThreadState | null> {
    return this.prisma.supportThread.findFirst({
      where: {
        userId,
        OR: [{ status: { in: ['new', 'replied'] } }, { status: 'closed', closedByLift: true }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, closedByLift: true },
    });
  }

  /**
   * Writes a status change in one transaction: the status, the sessions of a suspended account, the counters of the
   * questions and replies it touches (R13, DEC-192), and the contact thread (DEC-116).
   */
  applyStatusChange(change: StatusChangeWrite): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await lockAccountGraphExclusive(tx);
      const { count } = await tx.user.updateMany({
        where: { id: change.userId, status: change.expectedStatus },
        data: { status: change.status, statusChangedAt: change.now, suspensionReason: change.reason },
      });
      if (count !== 1) {
        // Another change (a deletion, a suspension) landed between the read and this write: nothing is written.
        throw new ConflictException('Le statut du compte a changé entre-temps. Actualisez la page.');
      }
      if (change.status === 'suspended') {
        await tx.session.deleteMany({ where: { userId: change.userId } });
      }
      await recalculateCounters(tx, change.userId);
      await applyThreadPlan(tx, change);
      await change.record(tx);
    });
  }

  /**
   * Starts the deletion window of an active or suspended account, in one transaction: the status and the purge date
   * (the window of R16), the counters the account no longer adds to, its sessions, and the audit entry. False, with no
   * write, when the account is no longer in one of those statuses.
   */
  startDeletion(change: DeletionWrite): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await lockAccountGraphExclusive(tx);
      const result = await tx.user.updateMany({
        where: { id: change.userId, status: { in: ['active', 'suspended'] } },
        data: {
          status: 'pending_deletion',
          statusChangedAt: change.now,
          deletionRequestedAt: change.now,
          deletionPurgeAt: change.purgeAt,
          deletionOrigin: change.origin,
          suspensionReason: null,
        },
      });
      if (result.count !== 1) {
        return false;
      }

      await recalculateCounters(tx, change.userId);
      await tx.session.deleteMany({ where: { userId: change.userId } });
      await closeThreadAtDeletion(tx, change);
      await change.record(tx);
      return true;
    });
  }

  /** The figures of the account view. The counts are read together, at the time of the request. */
  async activity(id: string, now: Date): Promise<AccountActivity> {
    const [lastLogin, activeSessionCount, reports, openReports, hiddenQuestions, hiddenReplies] =
      await Promise.all([
        this.prisma.loginEvent.findFirst({
          where: { userId: id, result: 'success' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.session.count({ where: { userId: id, expiresAt: { gt: now } } }),
        this.prisma.report.count({ where: authoredReports(id) }),
        this.prisma.report.count({ where: { ...authoredReports(id), status: 'open' } }),
        this.prisma.question.count({ where: { authorId: id, moderationStatus: { not: 'visible' } } }),
        this.prisma.reply.count({ where: { authorId: id, moderationStatus: { not: 'visible' } } }),
      ]);

    return {
      lastLoginAt: lastLogin?.createdAt ?? null,
      activeSessionCount,
      reports: { total: reports, open: openReports },
      moderatedContentCount: hiddenQuestions + hiddenReplies,
    };
  }
}

const ACCOUNT_ROW_SELECT = {
  id: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  email: true,
  status: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Closes the open contact thread when an administrator starts a deletion (DEC-116). It is not closed by a lifting. */
async function closeThreadAtDeletion(tx: Prisma.TransactionClient, change: DeletionWrite): Promise<void> {
  if (change.thread === null) {
    return;
  }
  await tx.supportThread.update({
    where: { id: change.thread.threadId },
    data: {
      status: 'closed',
      closedAt: change.now,
      closedById: change.actorId,
      closedByLift: false,
      openUserId: null,
    },
  });
}

/** Closes the contact thread at a lifting, or reopens the one a lifting closed (DEC-116, DEC-117). */
async function applyThreadPlan(tx: Prisma.TransactionClient, change: StatusChangeWrite): Promise<void> {
  if (change.thread === null) {
    return;
  }

  if (change.thread.kind === 'close') {
    await tx.supportThread.update({
      where: { id: change.thread.threadId },
      data: {
        status: 'closed',
        closedAt: change.now,
        closedById: change.closedById,
        closedByLift: true,
        openUserId: null,
      },
    });
    return;
  }

  await tx.supportThread.update({
    where: { id: change.thread.threadId },
    data: { status: 'new', closedAt: null, closedById: null, closedByLift: false, openUserId: change.userId },
  });
}

/** The reports made about the questions or the replies of the account. */
function authoredReports(id: string): Prisma.ReportWhereInput {
  return { OR: [{ question: { authorId: id } }, { reply: { authorId: id } }] };
}
