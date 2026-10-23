'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchUnreadCount, NOTIFICATIONS_READ_EVENT } from '@/lib/notifications-api';

/**
 * Unread notifications for the badge (L2 section 6.4). Read again on every page change, so the badge follows
 * what the visitor reads. A failed call keeps the last known count; a suspended account gets 0 from the API.
 */
export function useUnreadCount(pathname: string): number {
  const [unread, setUnread] = useState(0);
  /** Counts the resets: a count asked before a reset is stale and must not overwrite the 0 of that reset. */
  const resets = useRef(0);

  useEffect(() => {
    let current = true;
    const resetsWhenAsked = resets.current;
    fetchUnreadCount().then((result) => {
      if (current && result.ok && resets.current === resetsWhenAsked) {
        setUnread(result.body.unread);
      }
    });
    return () => {
      current = false;
    };
  }, [pathname]);

  // Marking everything as read resets the badge at once, without waiting for the next page change.
  useEffect(() => {
    const reset = () => {
      resets.current += 1;
      setUnread(0);
    };
    window.addEventListener(NOTIFICATIONS_READ_EVENT, reset);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, reset);
  }, []);

  return unread;
}
