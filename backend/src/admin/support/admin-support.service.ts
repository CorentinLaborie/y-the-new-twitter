import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MAIL_SENDER, type MailSender, type OutgoingMail } from '../../common/mail/mail-sender';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../common/pagination/keyset-cursor';
import type { SupportStatus } from '../../database/generated/client/client';
import { AuditLogService } from '../audit/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-log.types';
import { maskEmail } from '../users/mask-email';
import { supportReplyMail } from './admin-support-mail';
import {
  AdminSupportRepository,
  type SupportThreadListRow,
  type SupportThreadRow,
} from './admin-support.repository';
import type {
  SupportAccountView,
  SupportListOptions,
  SupportListStatus,
  SupportThreadDetailView,
  SupportThreadListItem,
  SupportThreadPage,
} from './admin-support.types';

const NOT_FOUND_MESSAGE = 'Demande introuvable.';
const CLOSED_MESSAGE = 'Ce fil est fermé : aucune réponse n’est possible.';
const ALREADY_CLOSED_MESSAGE = 'Ce fil est déjà fermé.';

/**
 * The contact threads of the back-office (section 3.4, DEC-116): the list, one thread with its messages, the answer of
 * an administrator (sent by e-mail to the account) and the closing of a thread. Each answer and each closing is audited
 * in the same transaction as its write. The e-mail address is never returned: only its masked form.
 */
@Injectable()
export class AdminSupportService {
  private readonly logger = new Logger(AdminSupportService.name);

  constructor(
    private readonly repository: AdminSupportRepository,
    private readonly audit: AuditLogService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  /** One page of threads, newest first. The cursor is opaque; nextCursor is null on the last page. */
  async list(options: SupportListOptions): Promise<SupportThreadPage> {
    const after = options.cursor === undefined ? undefined : decodeKeysetCursor(options.cursor);
    const rows = await this.repository.page({
      after,
      limit: options.limit + 1,
      statuses: statusesOf(options.status),
    });

    const pageRows = rows.slice(0, options.limit);
    const hasMore = rows.length > options.limit;
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map(toListItem),
      nextCursor:
        hasMore && last !== undefined ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  /** One thread with all its messages. Unknown ids answer 404. */
  async view(id: string): Promise<SupportThreadDetailView> {
    return toDetailView(await this.findOrFail(id));
  }

  /**
   * Sends an answer to the account by e-mail. The answer is stored in the thread, which becomes `replied`, and audited.
   * A closed thread answers 409. The e-mail follows the commit (R18).
   */
  async reply(actorId: string, id: string, text: string, now: Date): Promise<SupportThreadDetailView> {
    const thread = await this.findOrFail(id);
    if (thread.status === 'closed') {
      throw new ConflictException(CLOSED_MESSAGE);
    }

    const written = await this.repository.reply({
      threadId: id,
      adminId: actorId,
      body: text,
      now,
      record: (db) =>
        this.audit.appendIn(db, {
          actorId,
          action: AUDIT_ACTIONS.contactReply,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.contact,
          targetId: id,
          reason: null,
          details: { channel: 'email' },
        }),
    });
    if (!written) {
      throw new ConflictException(CLOSED_MESSAGE);
    }

    await this.notify(supportReplyMail(thread.user.email, thread.reference, text));
    return this.view(id);
  }

  /**
   * Closes an open thread: the account gets a new thread the next time it writes. No e-mail is sent. Re-authentication is
   * checked by the route (DEC-088). An already closed thread answers 409.
   */
  async close(actorId: string, id: string, now: Date): Promise<SupportThreadDetailView> {
    const thread = await this.findOrFail(id);
    if (thread.status === 'closed') {
      throw new ConflictException(ALREADY_CLOSED_MESSAGE);
    }

    const closed = await this.repository.close({
      threadId: id,
      adminId: actorId,
      now,
      record: (db) =>
        this.audit.appendIn(db, {
          actorId,
          action: AUDIT_ACTIONS.contactClose,
          result: 'ok',
          targetType: AUDIT_TARGET_TYPES.contact,
          targetId: id,
          reason: null,
          details: null,
        }),
    });
    if (!closed) {
      throw new ConflictException(ALREADY_CLOSED_MESSAGE);
    }

    return this.view(id);
  }

  private async findOrFail(id: string): Promise<SupportThreadRow> {
    const thread = await this.repository.findById(id);
    if (thread === null) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    return thread;
  }

  /**
   * The e-mail of an answer (R18). A failed send does not undo the answer, which is already stored: it is logged without
   * the address, so the failure is not silent.
   */
  private async notify(message: OutgoingMail): Promise<void> {
    try {
      await this.mail.send(message);
    } catch {
      this.logger.error('The answer to a contact thread could not be sent.');
    }
  }
}

/** The status filter as the repository reads it: the open statuses, or closed. Absent: every status. */
function statusesOf(status: SupportListStatus | undefined): SupportStatus[] | undefined {
  switch (status) {
    case 'open':
      return ['new', 'replied'];
    case 'closed':
      return ['closed'];
    case undefined:
      return undefined;
  }
}

function toAccountView(user: SupportThreadRow['user']): SupportAccountView {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    maskedEmail: maskEmail(user.email),
    createdAt: user.createdAt.toISOString(),
  };
}

function toListItem(row: SupportThreadListRow): SupportThreadListItem {
  const latest = row.messages[0];
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    receivedAt: latest?.sentAt.toISOString() ?? null,
    latestMessage: latest?.body ?? null,
    account: toAccountView(row.user),
  };
}

function toDetailView(row: SupportThreadRow): SupportThreadDetailView {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByLift: row.closedByLift,
    account: {
      ...toAccountView(row.user),
      statusChangedAt: row.user.statusChangedAt?.toISOString() ?? null,
      suspensionReason: row.user.suspensionReason,
    },
    messages: row.messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      body: message.body,
      sentAt: message.sentAt.toISOString(),
    })),
  };
}
