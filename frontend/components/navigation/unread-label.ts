/*
 * Unread count of the notifications entry (badge, plan L0 section 6, L2 section 6.4). Pure functions.
 * The badge hides at 0, shows the number up to 99 and "99+" above. The accessible name carries the exact count:
 * « Notifications, 3 non lues » (decision 12 of the L0 plan).
 */

import type { NavEntry } from './nav-items';

/** Text of the visible badge, or null when it must be hidden (no unread line). */
export function unreadBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) {
    return null;
  }
  return count > 99 ? '99+' : String(Math.floor(count));
}

/** « 1 non lue » or « 3 non lues » (the feminine of « notification »). */
export function unreadPhrase(count: number): string {
  return count === 1 ? '1 non lue' : `${count} non lues`;
}

/**
 * Accessible name of an entry. Only the notifications entry carries the count, and only while some line is unread;
 * otherwise the visible label is the name.
 */
export function entryAccessibleName(entry: NavEntry, unread: number): string {
  if (!entry.countsUnread || unread < 1) {
    return entry.label;
  }
  return `${entry.label}, ${unreadPhrase(Math.floor(unread))}`;
}
