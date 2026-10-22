'use client';

import { useState } from 'react';
import { moreBadgeCount, MoreMenu, MoreTrigger } from './more-menu';
import { NAV_ENTRIES, type NavViewer } from './nav-items';
import { NavLink } from './nav-link';
import styles from './navigation.module.css';
import { splitForBottomBar } from './split-items';

type MobileBottomBarProps = {
  pathname: string;
  viewer: NavViewer;
  unread: number;
};

/**
 * Bottom bar of the mobile, under 768 px (plan L0, sections 5.1 and 5.2): Accueil, Explorer, Notifications, Messages,
 * then "Plus" as the fifth case (decision 2). The labels show under the icons (decision 4). "Plus" opens the sheet
 * with Signets, Profil, the settings, the help pages and the sign-out.
 */
export function MobileBottomBar({ pathname, viewer, unread }: MobileBottomBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { visible, overflow } = splitForBottomBar(NAV_ENTRIES);

  return (
    <nav aria-label="Navigation principale" className={styles.bottomBar}>
      <ul className={styles.barList}>
        {visible.map((entry) => (
          <li key={entry.id} className={styles.barItem}>
            <NavLink entry={entry} viewer={viewer} pathname={pathname} unread={unread} variant="bar" />
          </li>
        ))}
        <li className={styles.barItem}>
          <MoreTrigger
            variant="bar"
            expanded={moreOpen}
            badgeCount={moreBadgeCount(overflow, unread)}
            onClick={() => setMoreOpen((open) => !open)}
          />
        </li>
      </ul>
      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        overflow={overflow}
        viewer={viewer}
        pathname={pathname}
        unread={unread}
      />
    </nav>
  );
}
