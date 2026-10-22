'use client';

import Link from 'next/link';
import { useState } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { AccountButton } from './account-button';
import { NAV_ENTRIES, type NavViewer } from './nav-items';
import { NavLink } from './nav-link';
import { PosterButton } from './poster-button';
import styles from './navigation.module.css';
import { MoreMenu, MoreTrigger } from './more-menu';

type DesktopSidebarProps = {
  pathname: string;
  viewer: NavViewer;
  unread: number;
};

/**
 * Sidebar of the desktop, 1280 px and more (plan L0, section 4.1): logo, the seven destinations, "Poster", and the
 * account block. The "Plus" entry and the account block open the same more menu, which has no destination in it here.
 */
export function DesktopSidebar({ pathname, viewer, unread }: DesktopSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav aria-label="Navigation principale" className={styles.sidebarNav}>
      <Link href="/home" className={styles.logo} aria-label="Y, accueil">
        <YMark size={40} />
      </Link>
      <ul className={styles.list}>
        {NAV_ENTRIES.map((entry) => (
          <li key={entry.id}>
            <NavLink entry={entry} viewer={viewer} pathname={pathname} unread={unread} variant="sidebar" />
          </li>
        ))}
        <li>
          <MoreTrigger
            variant="sidebar"
            expanded={moreOpen}
            badgeCount={0}
            onClick={() => setMoreOpen((open) => !open)}
          />
        </li>
      </ul>
      <PosterButton variant="sidebar" />
      <AccountButton
        viewer={viewer}
        variant="sidebar"
        expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      />
      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        overflow={[]}
        viewer={viewer}
        pathname={pathname}
        unread={unread}
      />
    </nav>
  );
}
