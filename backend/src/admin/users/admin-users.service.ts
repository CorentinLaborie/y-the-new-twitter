import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetPosition,
} from '../../common/pagination/keyset-cursor';
import { MAIL_SENDER, type MailSender, type OutgoingMail } from '../../common/mail/mail-sender';
import { AuditLogService } from '../audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-log.types';
import { DELETION_WINDOW_MS } from '../../auth/account-deletion/account-deletion.service';
import { deletionReasonText, type DeletionReasonCode } from './account-deletion-reasons';
import { AccountRow, AdminUsersRepository } from './admin-users.repository';
import type {
  AccountListItem,
  AccountListOptions,
  AccountPage,
  AccountView,
  StatusChangeResult,
} from './admin-users.types';
import { maskEmail } from './mask-email';
import { deletionMail, reactivationMail, suspensionMail } from './status-change-mail';
import {
  canStartAdminDeletion,
  contactThreadPlan,
  statusChangeKind,
  type RequestedAccountStatus,
} from './status-change';

/** The audit entries the account view shows. The full history is paged in a later step. */
const HISTORY_LIMIT = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The account search and the account view of the back-office (section 3.3), and the status changes (DEC-077). */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly repository: AdminUsersRepository,
    private readonly audit: AuditLogService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
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

  /**
   * Suspends an active account, or lifts a suspension, with a reason (DEC-077). The status, the sessions, the counters
   * and the contact thread change in one transaction. The audit entries are written in that same transaction, and the e-mail follows the commit. Re-authentication is
   * checked by the route (DEC-088). An administrator cannot change the status of their own account.
   */
  async changeStatus(
    actorId: string,
    targetId: string,
    request: { status: RequestedAccountStatus; reason: string },
    now: Date,
  ): Promise<StatusChangeResult> {
    if (targetId === actorId) {
      throw new ConflictException('Vous ne pouvez pas changer le statut de votre propre compte.');
    }

    const account = await this.repository.findById(targetId);
    if (account === null) {
      throw new NotFoundException('Compte introuvable.');
    }

    const kind = statusChangeKind(account.status, request.status);
    if (kind === null) {
      throw new ConflictException('Ce changement de statut n’est pas possible pour ce compte.');
    }

    const thread = contactThreadPlan(kind, await this.repository.contactThreadOf(targetId));
    const suspensionReason = kind === 'suspend' ? request.reason : null;
    await this.repository.applyStatusChange({
      userId: targetId,
      status: request.status,
      reason: suspensionReason,
      now,
      closedById: actorId,
      thread,
      record: async (db) => {
        await this.audit.appendIn(db, {
          actorId,
          action: kind === 'suspend' ? AUDIT_ACTIONS.userSuspend : AUDIT_ACTIONS.userReactivate,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.user,
          targetId,
          reason: request.reason,
          details: null,
        });
        if (thread?.kind === 'close') {
          await this.audit.appendIn(db, {
            actorId,
            action: AUDIT_ACTIONS.contactClose,
            result: 'ok',
            targetType: AUDIT_TARGET_TYPES.contact,
            targetId: thread.threadId,
            reason: null,
            details: null,
          });
        }
      },
    });

    // The e-mail is sent after the commit: it cannot be part of the transaction (R18).
    await this.notifyStatusChange(
      kind === 'suspend' ? suspensionMail(account.email, request.reason) : reactivationMail(account.email),
    );

    return {
      id: targetId,
      status: request.status,
      statusChangedAt: now.toISOString(),
      suspensionReason,
    };
  }

  /**
   * Starts the deletion of an active or suspended account, with a reason (owner decision 2026-10-21). The account enters
   * the 90-day window of R16 with the same purge date, the sessions close, and the purge erases the account at the end.
   * Unlike the user's own deletion, a login does not cancel it. The audit entry and the e-mail carry the reason.
   * Re-authentication is checked by the route. An administrator cannot delete their own account, nor an administrator
   * or a moderator.
   */
  async startDeletion(
    actorId: string,
    targetId: string,
    request: { reasonCode: DeletionReasonCode; otherReason?: string },
    now: Date,
  ): Promise<StatusChangeResult> {
    if (targetId === actorId) {
      throw new ConflictException('Vous ne pouvez pas supprimer votre propre compte.');
    }

    const account = await this.repository.findById(targetId);
    if (account === null) {
      throw new NotFoundException('Compte introuvable.');
    }
    if (account.role === 'admin' || account.role === 'moderator') {
      throw new ConflictException('Un administrateur ou un modérateur ne peut pas être supprimé depuis le back-office.');
    }
    if (!canStartAdminDeletion(account.status)) {
      throw new ConflictException('La suppression n’est pas possible pour ce compte dans son statut actuel.');
    }

    const reason = deletionReasonText(request.reasonCode, request.otherReason);
    const started = await this.repository.startDeletion({
      userId: targetId,
      now,
      purgeAt: new Date(now.getTime() + DELETION_WINDOW_MS),
      origin: 'administrator',
      record: (db) =>
        this.audit.appendIn(db, {
          actorId,
          action: AUDIT_ACTIONS.userDelete,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.user,
          targetId,
          reason,
          details: { reasonCode: request.reasonCode },
        }),
    });
    if (!started) {
      // The status changed between the read and the write: nothing was written.
      throw new ConflictException('La suppression n’est pas possible pour ce compte dans son statut actuel.');
    }

    // The e-mail is sent after the commit, as for a status change (R18).
    await this.notifyStatusChange(deletionMail(account.email, reason, DELETION_WINDOW_MS / DAY_MS));

    return {
      id: targetId,
      status: 'pending_deletion',
      statusChangedAt: now.toISOString(),
      suspensionReason: null,
    };
  }

  /**
   * The e-mail of a status change (R18). A failed send does not undo the change, which is already written: it is logged
   * without the address, so the failure is not silent.
   */
  private async notifyStatusChange(message: OutgoingMail): Promise<void> {
    try {
      await this.mail.send(message);
    } catch {
      this.logger.error('The account status e-mail could not be sent.');
    }
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
