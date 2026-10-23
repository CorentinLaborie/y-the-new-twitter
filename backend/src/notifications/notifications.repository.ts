import { Injectable } from '@nestjs/common';
import { Prisma } from '../database/generated/client/client';
import type { NotificationType } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by the service. */
export type NotificationsDb = Prisma.TransactionClient;

/** The types that group one line per question and type (section 4.1). */
const REACTION_TYPES: NotificationType[] = ['reaction_like', 'reaction_dislike', 'reaction_y'];

/** Keyset position of a page: the creation time and id of the last grouped row returned. */
export interface NotificationCursor {
  readonly createdAt: Date;
  readonly id: string;
}

/**
 * One row of a page, after the grouping of reactions (section 4.1 of the L2 plan). A reaction group is the
 * reactions of one question and one reaction type; `actor_*` and `question_body` are read on the newest row.
 */
export interface NotificationRow {
  readonly id: string;
  readonly type: NotificationType;
  readonly created_at: Date;
  readonly read_at: Date | null;
  readonly actor_id: string | null;
  readonly question_id: string | null;
  readonly reply_id: string | null;
  readonly actor_count: number;
  readonly has_unread: boolean;
  readonly actor_handle: string | null;
  readonly actor_display_name: string | null;
  readonly question_body: string | null;
  readonly reply_body: string | null;
}

/**
 * The notifications a viewer may see, one row per group. Visibility (section 4.1): the viewer's own notifications;
 * an actor who is active and in no block with the viewer (R13, R14); a question that is not deleted or hidden and
 * whose author is active; a reply that is not deleted or hidden. A system notification has no actor, and a notice
 * with no question or no reply is not filtered on that side.
 */
function visibleRows(viewerId: string, type: NotificationType | undefined): Prisma.Sql {
  const typeFilter = type === undefined ? Prisma.empty : Prisma.sql`AND n.type = ${type}::notification_type`;

  return Prisma.sql`
    SELECT n.id, n.type, n.created_at, n.read_at, n.actor_id, n.question_id, n.reply_id,
      CASE WHEN n.type IN ('reaction_like', 'reaction_dislike', 'reaction_y')
        THEN 'group:' || n.question_id::text || ':' || n.type::text
        ELSE 'row:' || n.id::text
      END AS group_key
    FROM notifications n
    LEFT JOIN users actor ON actor.id = n.actor_id
    LEFT JOIN questions q ON q.id = n.question_id
    LEFT JOIN users question_author ON question_author.id = q.author_id
    LEFT JOIN replies r ON r.id = n.reply_id
    WHERE n.recipient_id = ${viewerId}::uuid
      AND (n.actor_id IS NULL OR (
        actor.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = actor.id AND b.blocked_id = ${viewerId}::uuid)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = ${viewerId}::uuid AND b.blocked_id = actor.id)
      ))
      AND (n.question_id IS NULL OR (
        q.deleted_at IS NULL AND q.moderation_status = 'visible' AND question_author.status = 'active'
      ))
      AND (n.reply_id IS NULL OR (r.deleted_at IS NULL AND r.moderation_status = 'visible'))
      ${typeFilter}
  `;
}

/** The grouped rows: one count of distinct actors and one unread flag per group. */
function groupedRows(viewerId: string, type: NotificationType | undefined): Prisma.Sql {
  return Prisma.sql`
    visible AS (${visibleRows(viewerId, type)}),
    groups AS (
      SELECT group_key,
        GREATEST(count(DISTINCT actor_id), 1)::int AS actor_count,
        bool_or(read_at IS NULL) AS has_unread
      FROM visible
      GROUP BY group_key
    )
  `;
}

/** Reads and counts the notifications of a viewer, with the reaction groups of section 4.1. */
@Injectable()
export class NotificationsRepository {
  /**
   * One page, newest group first. The page holds `take` groups, which the caller sizes as limit + 1 to know whether
   * another page exists. The cursor compares the newest row of each group, so a group is never repeated or skipped.
   */
  async findPage(
    db: NotificationsDb,
    viewerId: string,
    take: number,
    type: NotificationType | undefined,
    cursor: NotificationCursor | undefined,
  ): Promise<NotificationRow[]> {
    const cursorFilter =
      cursor === undefined
        ? Prisma.empty
        : Prisma.sql`AND (latest.created_at < ${cursor.createdAt} OR (latest.created_at = ${cursor.createdAt} AND latest.id < ${cursor.id}::uuid))`;

    return db.$queryRaw<NotificationRow[]>`
      WITH ${groupedRows(viewerId, type)},
      latest AS (
        SELECT DISTINCT ON (group_key) group_key, id, type, created_at, read_at, actor_id, question_id, reply_id
        FROM visible
        ORDER BY group_key, created_at DESC, id DESC
      )
      SELECT latest.id, latest.type, latest.created_at, latest.read_at, latest.actor_id, latest.question_id,
        latest.reply_id, groups.actor_count, groups.has_unread,
        actor.handle AS actor_handle, actor.display_name AS actor_display_name,
        q.body AS question_body, r.body AS reply_body
      FROM latest
      JOIN groups USING (group_key)
      LEFT JOIN users actor ON actor.id = latest.actor_id
      LEFT JOIN questions q ON q.id = latest.question_id
      LEFT JOIN replies r ON r.id = latest.reply_id
      WHERE TRUE ${cursorFilter}
      ORDER BY latest.created_at DESC, latest.id DESC
      LIMIT ${take}
    `;
  }

  /** How many groups hold an unread row: a reaction group counts once, as the list shows it (section 4.2). */
  async countUnread(db: NotificationsDb, viewerId: string): Promise<number> {
    const rows = await db.$queryRaw<{ unread: number }[]>`
      WITH ${groupedRows(viewerId, undefined)}
      SELECT count(*)::int AS unread FROM groups WHERE has_unread
    `;

    return rows[0]?.unread ?? 0;
  }

  /**
   * Marks the unread lines of the viewer as read now, or only the lines of `ids` when given (the lines the page showed).
   * Lines already read keep their date.
   */
  async markAllRead(db: NotificationsDb, viewerId: string, at: Date, ids?: string[]): Promise<Prisma.BatchPayload> {
    if (ids === undefined) {
      return db.notification.updateMany({ where: { recipientId: viewerId, readAt: null }, data: { readAt: at } });
    }
    const shown = await db.notification.updateMany({
      where: { recipientId: viewerId, readAt: null, id: { in: ids } },
      data: { readAt: at },
    });
    // A reaction line is a group (one line per question and type, see visibleRows): the id the page sent is only its
    // newest row, so the other reactions of the same group are marked too, or the line would stay unread.
    const groups = await db.notification.findMany({
      where: { recipientId: viewerId, id: { in: ids }, type: { in: REACTION_TYPES } },
      select: { questionId: true, type: true },
    });
    if (groups.length === 0) {
      return shown;
    }
    const group = await db.notification.updateMany({
      where: {
        recipientId: viewerId,
        readAt: null,
        OR: groups.map((line) => ({ questionId: line.questionId, type: line.type })),
      },
      data: { readAt: at },
    });

    return { count: shown.count + group.count };
  }
}
