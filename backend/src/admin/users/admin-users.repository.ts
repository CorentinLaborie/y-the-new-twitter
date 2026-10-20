import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../../common/pagination/keyset-cursor';
import { AccountStatus, Prisma, UserRole } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** A row of the account search, as the database returns it. */
export interface AccountRow {
  id: string;
  handle: string;
  displayName: string;
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
  email: true,
  status: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** The reports made about the questions or the replies of the account. */
function authoredReports(id: string): Prisma.ReportWhereInput {
  return { OR: [{ question: { authorId: id } }, { reply: { authorId: id } }] };
}
