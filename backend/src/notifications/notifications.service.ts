import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import type { NotificationType } from '../database/generated/client/client';
import { NotificationCursor, NotificationRow, NotificationsRepository } from './notifications.repository';

/** One notification as the API returns it (section 4.1 of the L2 plan). */
export interface NotificationView {
  readonly id: string;
  readonly type: NotificationType;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly actor: { readonly handle: string; readonly displayName: string } | null;
  readonly actorCount: number;
  readonly question: { readonly id: string; readonly text: string } | null;
  readonly reply: { readonly id: string; readonly text: string } | null;
}

/** One page of notifications. `nextCursor` is null on the last page. */
export interface NotificationPage {
  readonly items: NotificationView[];
  readonly nextCursor: string | null;
}

/** Turns one database row into the view the API returns. */
export function toNotificationView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at.toISOString(),
    readAt: row.has_unread ? null : (row.read_at?.toISOString() ?? null),
    actor: row.actor_id && row.actor_handle && row.actor_display_name
      ? { handle: row.actor_handle, displayName: row.actor_display_name }
      : null,
    actorCount: row.actor_count,
    question: row.question_id && row.question_body !== null ? { id: row.question_id, text: row.question_body } : null,
    reply: row.reply_id && row.reply_body !== null ? { id: row.reply_id, text: row.reply_body } : null,
  };
}

// The id must be a full UUID: a 36-character string of dashes would pass the length check and fail the ::uuid cast (500).
const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The cursor is the creation time and id of the last row of a page, base64url-encoded. */
export function encodeCursor(cursor: NotificationCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString('base64url');
}

/** Reads a cursor back; a value that is not a cursor gives undefined (the controller answers 400). */
export function decodeCursor(value: string): NotificationCursor | undefined {
  const match = CURSOR_PATTERN.exec(Buffer.from(value, 'base64url').toString('utf8'));
  if (match === null) {
    return undefined;
  }
  const createdAt = new Date(match[1]);

  return Number.isNaN(createdAt.getTime()) ? undefined : { createdAt, id: match[2] };
}

/**
 * Notifications of a logged-in viewer (L2). A suspended account reads an empty list and a count of 0 (section 4.1).
 * Any other status that is neither active nor suspended is refused.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsRepository,
  ) {}

  async list(
    viewer: SessionUser,
    limit: number,
    type: NotificationType | undefined,
    cursor: NotificationCursor | undefined,
  ): Promise<NotificationPage> {
    this.assertReadable(viewer);
    if (viewer.status === 'suspended') {
      return { items: [], nextCursor: null };
    }

    const rows = await this.notifications.findPage(this.prisma, viewer.id, limit + 1, type, cursor);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const nextCursor = rows.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    return { items: pageRows.map(toNotificationView), nextCursor };
  }

  async unreadCount(viewer: SessionUser): Promise<number> {
    this.assertReadable(viewer);
    if (viewer.status === 'suspended') {
      return 0;
    }

    return this.notifications.countUnread(this.prisma, viewer.id);
  }

  private assertReadable(viewer: SessionUser): void {
    if (viewer.status !== 'active' && viewer.status !== 'suspended') {
      throw new ForbiddenException('Le compte ne peut pas lire ses notifications.');
    }
  }

  /** Opening the page marks every line as read (section 4.3). A suspended account is refused by the guard. */
  async markAllRead(viewer: SessionUser): Promise<void> {
    await this.notifications.markAllRead(this.prisma, viewer.id, new Date());
  }
}
