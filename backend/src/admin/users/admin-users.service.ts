import { Injectable, NotFoundException } from '@nestjs/common';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetPosition,
} from '../../common/pagination/keyset-cursor';
import { AuditLogService } from '../audit/audit-log.service';
import { AUDIT_TARGET_TYPES } from '../audit/audit-log.types';
import { AccountRow, AdminUsersRepository } from './admin-users.repository';
import type { AccountListItem, AccountListOptions, AccountPage, AccountView } from './admin-users.types';
import { maskEmail } from './mask-email';

/** The audit entries the account view shows. The full history is paged in a later step. */
const HISTORY_LIMIT = 20;

/** The account search and the account view of the back-office (section 3.3). Reads only. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly repository: AdminUsersRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** One page of accounts, newest first. The cursor is opaque; nextCursor is null on the last page. */
  async list(options: AccountListOptions): Promise<AccountPage> {
    const after = options.cursor === undefined ? undefined : decodeKeysetCursor(options.cursor);
    const rows = await this.repository.page({
      after,
      limit: options.limit + 1,
      q: options.q,
      status: options.status,
    });

    const pageRows = rows.slice(0, options.limit);
    const hasMore = rows.length > options.limit;

    return {
      items: pageRows.map(toListItem),
      nextCursor: hasMore ? encodeKeysetCursor(positionOf(pageRows[pageRows.length - 1])) : null,
    };
  }

  /** One account, with its activity and its recent audit entries. Unknown ids answer 404. */
  async view(id: string): Promise<AccountView> {
    const account = await this.repository.findById(id);
    if (account === null) {
      throw new NotFoundException('Compte introuvable.');
    }

    const [activity, history] = await Promise.all([
      this.repository.activity(id, new Date()),
      this.audit.recentForTarget({ targetType: AUDIT_TARGET_TYPES.user, targetId: id }, HISTORY_LIMIT),
    ]);

    return {
      ...toListItem(account),
      statusChangedAt: account.statusChangedAt?.toISOString() ?? null,
      suspensionReason: account.suspensionReason,
      lastLoginAt: activity.lastLoginAt?.toISOString() ?? null,
      activeSessionCount: activity.activeSessionCount,
      reports: activity.reports,
      moderatedContentCount: activity.moderatedContentCount,
      history,
    };
  }
}

function toListItem(row: AccountRow): AccountListItem {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    status: row.status,
    role: row.role,
    maskedEmail: maskEmail(row.email),
    createdAt: row.createdAt.toISOString(),
  };
}

function positionOf(row: AccountRow): KeysetPosition {
  return { createdAt: row.createdAt, id: row.id };
}
