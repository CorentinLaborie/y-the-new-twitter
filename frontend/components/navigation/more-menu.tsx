'use client';

import { useRef } from 'react';
import { YIcon } from '@/components/brand/y-icon';
import type { NavEntry, NavViewer } from './nav-items';
import { NavLink, classNames } from './nav-link';
import { SecondaryLinks } from './secondary-links';
import styles from './navigation.module.css';
import { useDialog } from './use-dialog';
import { unreadBadgeText, unreadPhrase } from './unread-label';

/**
 * Unread count shown on the "Plus" button: the count of the notifications only when they are hidden in the menu
 * (plan L0, decision 16). Otherwise 0, and the button shows no badge.
 */
export function moreBadgeCount(overflow: readonly NavEntry[], unread: number): number {
  return overflow.some((entry) => entry.countsUnread) ? unread : 0;
}

type MoreTriggerProps = {
  variant: 'sidebar' | 'rail' | 'bar';
  expanded: boolean;
  badgeCount: number;
  onClick: () => void;
};

/** The "Plus" button that opens the more menu (aria-haspopup and aria-expanded). */
export function MoreTrigger({ variant, expanded, badgeCount, onClick }: MoreTriggerProps) {
  const badge = unreadBadgeText(badgeCount);
  const name = badgeCount > 0 ? `Plus, ${unreadPhrase(badgeCount)}` : 'Plus';

  return (
    <button
      type="button"
      className={classNames(styles.link, styles.more, styles[variant], expanded && styles.current)}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={name}
      onClick={onClick}
    >
      <span className={styles.iconBox}>
        <YIcon name="circle-ellipsis" size={26} />
        {badge === null ? null : (
          <span className={styles.badge} aria-hidden="true">
            {badge}
          </span>
        )}
      </span>
      {variant === 'rail' ? null : <span className={styles.label}>Plus</span>}
    </button>
  );
}

type MoreMenuProps = {
  open: boolean;
  onClose: () => void;
  /** Destinations that do not fit in the bar or the rail, in their order. Empty on the sidebar. */
  overflow: readonly NavEntry[];
  viewer: NavViewer;
  pathname: string;
  unread: number;
};

/**
 * The "Plus" menu: a sheet from the bottom (plan L0, decision 5). It holds the destinations that do not fit, then
 * the settings, "Aide et à propos" and the sign-out. Keyboard: Escape closes it, the focus returns to the button.
 */
export function MoreMenu({ open, onClose, overflow, viewer, pathname, unread }: MoreMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(open, panelRef, onClose);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Plus"
        tabIndex={-1}
        className={styles.panel}
      >
        <div className={styles.sheetHeader}>
          <h2 className={styles.sheetTitle}>Plus</h2>
          <button type="button" className={styles.closeButton} aria-label="Fermer" onClick={onClose}>
            <YIcon name="x" size={24} />
          </button>
        </div>
        {overflow.length > 0 ? (
          <nav aria-label="Plus de destinations">
            {overflow.map((entry) => (
              <NavLink
                key={entry.id}
                entry={entry}
                viewer={viewer}
                pathname={pathname}
                unread={unread}
                variant="sheet"
                onNavigate={onClose}
              />
            ))}
          </nav>
        ) : null}
        <SecondaryLinks onNavigate={onClose} />
      </div>
    </>
  );
}
