'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useReloadOnBack } from '@/lib/use-reload-on-back';
import type { ApiResult } from '@/lib/api-client';
import {
  fetchNotificationPage,
  markAllNotificationsRead,
  type NotificationPage,
  type NotificationTab,
  type NotificationView,
} from '@/lib/notifications-api';
import { NotificationItem } from './notification-item';
import {
  NotificationsEmpty,
  NotificationsError,
  NotificationsLoading,
  notificationsFailureMessage,
} from './notifications-states';
import styles from './notifications.module.css';

/** The two tabs, in order. Their id is the value of the `tab` URL parameter ("all" has none). */
const TABS: readonly { id: NotificationTab; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'mention', label: 'Mentions' },
];

type ListPhase = 'loading' | 'ready' | 'failed';
type MoreStatus = 'idle' | 'loading' | 'failed';

type ListState = {
  phase: ListPhase;
  /** Message of the failed call: the first page (error state) or "Voir plus" (alert under the lines). */
  loadError: string;
  items: NotificationView[];
  nextCursor: string | null;
  /** State of the page loaded with "Voir plus". */
  moreStatus: MoreStatus;
};

const LOADING_LIST: ListState = { phase: 'loading', loadError: '', items: [], nextCursor: null, moreStatus: 'idle' };

/** How often the relative times are computed again ("à l'instant", "il y a 2 h"). */
const RELATIVE_TIME_REFRESH_MS = 60_000;

/** The read endpoint takes at most 100 ids per call: a longer list is sent in chunks, one after the other. */
const READ_CHUNK = 100;

/** Marks only the lines the page shows (decision of 2026-10-23): a line that arrives later stays unread. */
async function markShownRead(ids: string[]): Promise<ApiResult<void>> {
  let result: ApiResult<void> = { ok: true, status: 204, body: undefined };
  for (let index = 0; index < ids.length; index += READ_CHUNK) {
    result = await markAllNotificationsRead(ids.slice(index, index + READ_CHUNK));
    if (!result.ok) {
      return result;
    }
  }
  return result;
}

function readyList(page: NotificationPage): ListState {
  return { phase: 'ready', loadError: '', items: page.items, nextCursor: page.nextCursor, moreStatus: 'idle' };
}

/** The lines of `second` that `first` does not already have (a line can move between two pages). */
function appendNew(first: NotificationView[], second: NotificationView[]): NotificationView[] {
  const known = new Set(first.map((line) => line.id));
  return [...first, ...second.filter((line) => !known.has(line.id))];
}

/**
 * The notifications page (plan L2, sections 6.1 to 6.6): the tabs "Toutes" and "Mentions" (the tab is in the URL),
 * the list with "Voir plus", "Tout marquer comme lu" in the header, and the states. Opening the page marks every
 * notification as read once, after the first page is shown: that page keeps its unread lines for display.
 * A suspended account reads an empty list, and the page does not call the read endpoint (it refuses it).
 */
export function NotificationsScreen({ initialTab, suspended }: { initialTab: NotificationTab; suspended: boolean }) {
  const [tab, setTab] = useState<NotificationTab>(initialTab);
  const [list, setList] = useState<ListState>(LOADING_LIST);
  const [now, setNow] = useState(() => Date.now());
  const [markPending, setMarkPending] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const markErrorRef = useRef<HTMLParagraphElement>(null);

  // The relative times ("il y a 2 h") move on while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // A failed "Tout marquer comme lu" removes the focus with its disabled button: the message takes it back.
  useEffect(() => {
    if (markError !== null) {
      markErrorRef.current?.focus();
    }
  }, [markError]);
  /** Counts the first-page requests: an answer of a previous tab is ignored. */
  const requestToken = useRef(0);
  /** The page has been opened: the read call runs once, after its first successful page. */
  const openedRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Asks the first page of a tab. The caller shows the loading state first, except on mount (it starts in it). */
  const requestFirstPage = useCallback(
    (next: NotificationTab) => {
      const token = ++requestToken.current;
      fetchNotificationPage(next).then((result: ApiResult<NotificationPage>) => {
        if (token !== requestToken.current) {
          return;
        }
        if (!result.ok) {
          setList({ ...LOADING_LIST, phase: 'failed', loadError: notificationsFailureMessage(result.problem) });
          return;
        }
        setList(readyList(result.body));
        if (!openedRef.current) {
          openedRef.current = true;
          if (!suspended) {
            // The answer does not change the page: the lines keep their state for display (plan 6.3).
            // Only the unread lines this page shows are marked: the later pages keep theirs.
            const shownUnread = result.body.items.filter((line) => line.readAt === null).map((line) => line.id);
            if (shownUnread.length > 0) {
              void markAllNotificationsRead(shownUnread);
            }
          }
        }
      });
    },
    [suspended],
  );

  useEffect(() => {
    requestFirstPage(initialTab);
  }, [initialTab, requestFirstPage]);

  useReloadOnBack(() => restartFirstPage(tab));

  function restartFirstPage(next: NotificationTab) {
    setList(LOADING_LIST);
    requestFirstPage(next);
  }

  function selectTab(next: NotificationTab) {
    if (next === tab) {
      return;
    }
    setTab(next);
    window.history.replaceState(null, '', next === 'mention' ? '/notifications?tab=mention' : '/notifications');
    restartFirstPage(next);
  }

  /** Arrow keys, Home and End move between the tabs and select the tab reached (the tablist pattern). */
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1;
    let target: number | null = null;
    if (event.key === 'ArrowRight') {
      target = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft') {
      target = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = last;
    }
    if (target === null) {
      return;
    }
    event.preventDefault();
    tabRefs.current[target]?.focus();
    selectTab(TABS[target].id);
  }

  function loadMore(cursor: string) {
    const token = requestToken.current;
    setList((current) => ({ ...current, moreStatus: 'loading' }));
    fetchNotificationPage(tab, cursor).then((result) => {
      if (token !== requestToken.current) {
        return;
      }
      setList((current) =>
        result.ok
          ? {
              ...current,
              items: appendNew(current.items, result.body.items),
              nextCursor: result.body.nextCursor,
              moreStatus: 'idle',
            }
          : { ...current, moreStatus: 'failed', loadError: notificationsFailureMessage(result.problem) },
      );
    });
  }

  function markAllRead() {
    const shownUnread = list.items.filter((line) => line.readAt === null).map((line) => line.id);
    setMarkPending(true);
    setMarkError(null);
    markShownRead(shownUnread).then((result) => {
      setMarkPending(false);
      if (!result.ok) {
        setMarkError(notificationsFailureMessage(result.problem));
        return;
      }
      const readAt = new Date().toISOString();
      setList((current) => ({
        ...current,
        items: current.items.map((line) => (line.readAt === null ? { ...line, readAt } : line)),
      }));
      // The button is disabled now: the focus moves to the title, not to the body of the page.
      titleRef.current?.focus();
    });
  }

  const hasUnread = list.items.some((line) => line.readAt === null);
  const { phase, items, nextCursor, moreStatus } = list;

  return (
    <main className={styles.column}>
      <header className={styles.header}>
        <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
          Notifications
        </h1>
        <button
          type="button"
          className={`y-btn y-btn-outline y-btn-sm ${styles.markAll}`}
          disabled={!hasUnread || markPending || phase !== 'ready'}
          onClick={markAllRead}
        >
          Tout marquer comme lu
        </button>
      </header>

      <div role="tablist" aria-label="Filtrer les notifications" className={styles.tabs}>
        {TABS.map((item, index) => {
          const selected = item.id === tab;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`notifications-tab-${item.id}`}
              aria-selected={selected}
              aria-controls="notifications-panel"
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="notifications-panel"
        aria-labelledby={`notifications-tab-${tab}`}
        className={styles.panel}
      >
        {markError ? (
          <p ref={markErrorRef} tabIndex={-1} role="alert" className={styles.notice}>
            {markError}
          </p>
        ) : null}

        {phase === 'loading' ? <NotificationsLoading /> : null}
        {phase === 'failed' ? (
          <NotificationsError message={list.loadError} onRetry={() => restartFirstPage(tab)} />
        ) : null}
        {phase === 'ready' && items.length === 0 ? <NotificationsEmpty tab={tab} /> : null}

        {phase === 'ready' && items.length > 0 ? (
          <ol className={styles.list}>
            {items.map((line) => (
              <NotificationItem key={line.id} line={line} now={now} />
            ))}
          </ol>
        ) : null}

        {phase === 'ready' && nextCursor !== null && moreStatus === 'failed' ? (
          <p role="alert" className={styles.notice}>
            {list.loadError}
          </p>
        ) : null}
        {phase === 'ready' && nextCursor !== null ? (
          <button
            type="button"
            className={`y-loadmore ${moreStatus === 'loading' ? 'is-loading' : ''}`}
            disabled={moreStatus === 'loading'}
            aria-busy={moreStatus === 'loading' ? true : undefined}
            onClick={() => loadMore(nextCursor)}
          >
            {moreStatus === 'loading' ? <span className="y-loadmore-spinner" aria-hidden="true" /> : null}
            {moreStatus === 'loading' ? 'Chargement…' : 'Voir plus'}
          </button>
        ) : null}
      </div>
    </main>
  );
}
