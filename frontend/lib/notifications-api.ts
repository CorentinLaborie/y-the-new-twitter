/*
 * Client of the notifications API (L2). Plan: docs/plans/L2-NOTIFICATIONS-PLAN.md (sections 4 and 6).
 * Contract: backend/openapi.yaml, served by the API under /api/v1.
 *
 * GET /notifications[?cursor=…][&type=mention]
 *   200 { items, nextCursor }. 20 lines per page, 50 at most. type=mention is the Mentions tab.
 *   A reaction of one kind on one question is one line, with actorCount actors.
 *   400 for an unknown tab, an invalid limit or an invalid cursor.
 * GET /notifications/unread-count
 *   200 { unread }. A reaction group counts once.
 * POST /notifications/read-all
 *   204. Marks every unread line as read. Opening the page calls it; it needs the CSRF token.
 *   403 for an account that is not active; a suspended account reads an empty list and a count of 0.
 *
 * Errors are Problem Details, read as ApiProblem (lib/api-client.ts).
 */

import type { ApiResult } from '@/lib/api-client';
import { protectedApiRequest } from '@/lib/session-expired';

export type NotificationType =
  | 'reply_to_question'
  | 'conversation_opened'
  | 'reaction_like'
  | 'reaction_dislike'
  | 'reaction_y'
  | 'follow'
  | 'mention';

export type NotificationActor = { handle: string; displayName: string };

export type NotificationTarget = { id: string; text: string };

/** One line of the list. `readAt` is null while the line has an unread row. */
export type NotificationView = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  actor: NotificationActor | null;
  actorCount: number;
  question: NotificationTarget | null;
  reply: NotificationTarget | null;
};

export type NotificationPage = { items: NotificationView[]; nextCursor: string | null };

/** The Mentions tab shows only mentions; the other tab shows every type. */
export type NotificationTab = 'all' | 'mention';

/** One page of notifications. `cursor` is the nextCursor of the previous page, absent for the first one. */
export function fetchNotificationPage(tab: NotificationTab, cursor?: string): Promise<ApiResult<NotificationPage>> {
  const query = new URLSearchParams();
  if (tab === 'mention') {
    query.set('type', 'mention');
  }
  if (cursor) {
    query.set('cursor', cursor);
  }
  const search = query.toString();
  return protectedApiRequest<NotificationPage>('GET', `/notifications${search ? `?${search}` : ''}`);
}

/** The number of lines not read yet, for the badge of the navigation. */
export function fetchUnreadCount(): Promise<ApiResult<{ unread: number }>> {
  return protectedApiRequest<{ unread: number }>('GET', '/notifications/unread-count');
}

/** Marks every unread line as read. Called when the page opens (the API has no single-line read). */
export function markAllNotificationsRead(): Promise<ApiResult<void>> {
  return protectedApiRequest<void>('POST', '/notifications/read-all');
}
