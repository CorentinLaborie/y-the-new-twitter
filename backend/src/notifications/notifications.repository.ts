import { Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '../database/generated/client/client';
import { VISIBLE_QUESTION } from '../questions/question-view';

/** The Prisma client or a transaction opened by the service. */
export type NotificationsDb = Prisma.TransactionClient;

/** A notification row as the list reads it, with the actor, question and reply it may show. */
export const NOTIFICATION_LIST_SELECT = {
  id: true,
  type: true,
  createdAt: true,
  readAt: true,
  actor: { select: { handle: true, displayName: true } },
  question: { select: { id: true, body: true } },
  reply: { select: { id: true, body: true } },
} satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_LIST_SELECT }>;

/** Keyset position of a page: the last row returned. */
export interface NotificationCursor {
  readonly createdAt: Date;
  readonly id: string;
}

/**
 * Which notifications a viewer may see (section 4.1 of the L2 plan): their own, with an active actor the viewer
 * does not block and who does not block the viewer (R13, R14), and with a visible question and reply.
 * A notification without actor (system) or without question or reply is not filtered on that side.
 */
export function notificationsVisibleTo(viewerId: string): Prisma.NotificationWhereInput {
  return {
    AND: [
      { recipientId: viewerId },
      {
        OR: [
          { actorId: null },
          {
            actor: {
              status: 'active',
              blocks: { none: { blockedId: viewerId } },
              blockedBy: { none: { blockerId: viewerId } },
            },
          },
        ],
      },
      { OR: [{ questionId: null }, { question: VISIBLE_QUESTION }] },
      { OR: [{ replyId: null }, { reply: { deletedAt: null, moderationStatus: 'visible' } }] },
    ],
  };
}

/** The filters of one page: the visibility rules, the optional type, and the keyset position. */
export function notificationsPageWhere(
  viewerId: string,
  type: NotificationType | undefined,
  cursor: NotificationCursor | undefined,
): Prisma.NotificationWhereInput {
  const conditions: Prisma.NotificationWhereInput[] = [notificationsVisibleTo(viewerId)];
  if (type !== undefined) {
    conditions.push({ type });
  }
  if (cursor !== undefined) {
    conditions.push({
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    });
  }

  return { AND: conditions };
}

/** Reads and counts notifications. The only place that queries the notifications table for a viewer. */
@Injectable()
export class NotificationsRepository {
  /** One page, newest first, with one extra row to know whether another page exists. */
  findPage(
    db: NotificationsDb,
    viewerId: string,
    limit: number,
    type: NotificationType | undefined,
    cursor: NotificationCursor | undefined,
  ): Promise<NotificationRow[]> {
    return db.notification.findMany({
      where: notificationsPageWhere(viewerId, type, cursor),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: NOTIFICATION_LIST_SELECT,
    });
  }

  /** Unread notifications the viewer may see (the same rules as the list). */
  countUnread(db: NotificationsDb, viewerId: string): Promise<number> {
    return db.notification.count({
      where: { AND: [notificationsVisibleTo(viewerId), { readAt: null }] },
    });
  }
}
