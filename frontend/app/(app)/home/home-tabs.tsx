'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { HomeFeed } from '@/components/feed/home-feed';
import type { FeedTabId } from '@/lib/feed-api';
import styles from './home.module.css';

/** The two tabs, in order. Their id is the value of the `tab` URL parameter ("for-you" has none). */
const TABS: readonly { id: FeedTabId; label: string }[] = [
  { id: 'for-you', label: 'Pour vous' },
  { id: 'following', label: 'Abonnements' },
];

/**
 * The home page tabs (L3, section 7.3): "Pour vous" and "Abonnements" (the tab is in the URL, /home?tab=following).
 * Each tab is its own feed, mounted with its own key, so it starts from its first page. Arrow keys, Home and End move
 * between the tabs (the tablist pattern, as on the notifications page).
 */
export function HomeTabs({
  initialTab,
  displayName,
  avatarUrl,
  viewerHandle,
  suspended,
}: {
  initialTab: FeedTabId;
  displayName: string;
  avatarUrl: string | null;
  viewerHandle: string | null;
  suspended: boolean;
}) {
  const [tab, setTab] = useState<FeedTabId>(initialTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectTab(next: FeedTabId) {
    setTab(next);
    window.history.replaceState(null, '', next === 'following' ? '/home?tab=following' : '/home');
  }

  /** Arrow keys, Home and End move between the tabs and select the tab reached. */
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

  return (
    <>
      <div role="tablist" aria-label="Accueil" className={styles.tabs}>
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
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls="feed-panel"
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
      <div role="tabpanel" id="feed-panel" aria-labelledby={`tab-${tab}`}>
        <HomeFeed
          key={tab}
          tab={tab}
          displayName={displayName}
          avatarUrl={avatarUrl}
          viewerHandle={viewerHandle}
          suspended={suspended}
        />
      </div>
    </>
  );
}
