import { Injectable } from '@nestjs/common';
import type { KeysetPosition } from '../../common/pagination/keyset-cursor';
import { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuditTarget } from './audit-log.types';

/**
 * One fixed key for the whole table (DEC-063, DEC-070). Taken with pg_advisory_xact_lock, it is released when the
 * transaction ends, so two audit writes can never chain to the same previous entry.
 */
const AUDIT_CHAIN_LOCK_KEY = 7101001;

/** The Prisma client, or a transaction opened by the writer. Both have the same audit table delegate. */
export type AuditDb = Prisma.TransactionClient;

/** A row of admin_audit_log as the database returns it. The details are JSON, or null. */
export interface AuditRow {
  id: string;
  actorId: string | null;
  action: string;
  result: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  details: Prisma.JsonValue | null;
  createdAt: Date;
  prevHash: string;
}

/** The position after which a keyset page starts (createdAt, then id: the chain order, DEC-127). */
export type AuditPosition = KeysetPosition;

/**
 * The only access to admin_audit_log. The table is append-only for the application account (DEC-129): this class
 * only inserts and reads. Pages are keyset-paginated, so a page never skips or repeats a row.
 */
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs `work` in a transaction that holds the chain lock until it ends. */
  withChainLock<T>(work: (db: AuditDb) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY}::bigint)`;
      return work(db);
    });
  }

  /** The newest entry: the one the next entry is chained to. Null while the table is empty. */
  lastEntry(db: AuditDb): Promise<AuditRow | null> {
    return db.adminAuditLog.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  async insert(db: AuditDb, row: AuditRow): Promise<void> {
    await db.adminAuditLog.create({
      data: { ...row, details: row.details ?? Prisma.DbNull },
    });
  }

  /**
   * A page of entries, newest first, optionally of one action or one target, strictly after `after` when it is given.
   */
  page(options: {
    after?: AuditPosition;
    limit: number;
    action?: string;
    target?: AuditTarget;
  }): Promise<AuditRow[]> {
    return this.prisma.adminAuditLog.findMany({
      where: {
        ...(options.action === undefined ? {} : { action: options.action }),
        ...(options.target === undefined ? {} : options.target),
        ...(options.after === undefined ? {} : olderThan(options.after)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
    });
  }

  /** A page of entries, oldest first, strictly after `after` when it is given. Used to check the chain. */
  pageOldestFirst(options: { after?: AuditPosition; limit: number }): Promise<AuditRow[]> {
    return this.prisma.adminAuditLog.findMany({
      where: options.after === undefined ? {} : newerThan(options.after),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
    });
  }
}

function olderThan(after: AuditPosition): Prisma.AdminAuditLogWhereInput {
  return {
    OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
  };
}

function newerThan(after: AuditPosition): Prisma.AdminAuditLogWhereInput {
  return {
    OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }],
  };
}
