import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuditEntry, auditHmac, verifyAuditChain } from '../../common/audit/audit-chain';
import { AuditLogRepository, AuditRow, type AuditPosition } from './audit-log.repository';
import type {
  AuditEntryView,
  AuditListOptions,
  AuditPage,
  AuditVerification,
  NewAuditEntry,
} from './audit-log.types';

/** The previous hash of the first entry (DEC-063): 64 zeros. */
const GENESIS_HASH = '0'.repeat(64);
/** Rows read per page when the whole chain is checked. */
const VERIFY_PAGE_SIZE = 500;

/**
 * The back-office audit log (DEC-059, DEC-063, DEC-085). Every entry is chained to the one before it with an HMAC
 * keyed by AUDIT_HMAC_KEY, so an entry changed or removed in the middle of the chain is found by verify().
 */
@Injectable()
export class AuditLogService {
  private readonly key: string;

  constructor(
    config: ConfigService,
    private readonly repository: AuditLogRepository,
  ) {
    this.key = config.getOrThrow<string>('AUDIT_HMAC_KEY');
  }

  /**
   * Appends one entry. The last entry is read and the new one is inserted under the chain lock, so the new entry
   * always points at the real previous entry. The time of the new entry is never earlier than or equal to the last
   * one, so the order by time is the chain order (DEC-127). The id is set here, because the hash covers it.
   */
  append(entry: NewAuditEntry): Promise<void> {
    return this.repository.withChainLock(async (db) => {
      const last = await this.repository.lastEntry(db);
      const now = new Date();
      const createdAt =
        last !== null && now.getTime() <= last.createdAt.getTime() ? new Date(last.createdAt.getTime() + 1) : now;

      await this.repository.insert(db, {
        id: randomUUID(),
        actorId: entry.actorId,
        action: entry.action,
        result: entry.result,
        targetType: entry.targetType,
        targetId: entry.targetId,
        reason: entry.reason,
        details: entry.details,
        createdAt,
        prevHash: last === null ? GENESIS_HASH : auditHmac(this.key, toEntry(last)),
      });
    });
  }

  /** One page of the listing, newest first, optionally of one action. The cursor is opaque. */
  async list(options: AuditListOptions): Promise<AuditPage> {
    const after = options.cursor === undefined ? undefined : decodeCursor(options.cursor);
    const rows = await this.repository.page({ after, limit: options.limit + 1, action: options.action });

    const pageRows = rows.slice(0, options.limit);
    const hasMore = rows.length > options.limit;

    return {
      items: pageRows.map(toView),
      nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null,
    };
  }

  /** Checks the whole chain from the oldest kept entry (DEC-063). Rows removed by the purge are not reported. */
  async verify(): Promise<AuditVerification> {
    const entries: AuditEntry[] = [];
    let after: AuditPosition | undefined;
    let rows: AuditRow[];

    do {
      rows = await this.repository.pageOldestFirst({ after, limit: VERIFY_PAGE_SIZE });
      entries.push(...rows.map(toEntry));
      if (rows.length > 0) {
        after = positionOf(rows[rows.length - 1]);
      }
    } while (rows.length === VERIFY_PAGE_SIZE);

    return { ...verifyAuditChain(entries, this.key), checked: entries.length };
  }
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    result: row.result,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    details: row.details as AuditEntry['details'],
    createdAt: row.createdAt,
    prevHash: row.prevHash,
  };
}

function toView(row: AuditRow): AuditEntryView {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    result: row.result as AuditEntryView['result'],
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    details: row.details as AuditEntryView['details'],
    createdAt: row.createdAt.toISOString(),
  };
}

function positionOf(row: AuditRow): AuditPosition {
  return { createdAt: row.createdAt, id: row.id };
}

/** The cursor is the position of the last row of the page, in base64url JSON. */
function encodeCursor(row: AuditRow): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id }), 'utf8').toString('base64url');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(cursor: string): AuditPosition {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (
      typeof value.t === 'string' &&
      typeof value.i === 'string' &&
      UUID_PATTERN.test(value.i) &&
      !Number.isNaN(Date.parse(value.t))
    ) {
      return { createdAt: new Date(value.t), id: value.i };
    }
  } catch {
    // Handled below: any value that is not a valid cursor is refused the same way.
  }

  throw new BadRequestException('Curseur invalide.');
}
