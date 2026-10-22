'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { AccountButton } from './account-button';
import { moreBadgeCount, MoreMenu, MoreTrigger } from './more-menu';
import { NAV_ENTRIES, type NavViewer } from './nav-items';
import { NavLink } from './nav-link';
import { PosterButton } from './poster-button';
import styles from './navigation.module.css';
import { splitForRail } from './split-items';

/** Height used before the window is measured (the server render and the first client render agree on it). */
const DEFAULT_HEIGHT = 900;

/** The window height, read after the first render, and kept up to date on resize. */
function useViewportHeight(): number {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  useEffect(() => {
    function measure() {
      setHeight(window.innerHeight);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return height;
}

type TabletRailProps = {
  pathname: string;
  viewer: NavViewer;
  unread: number;
};

/**
 * Rail of the tablet, 768 to 1279 px (plan L0, section 4.2): logo, "Poster", the destinations as icons, and the
 * account block. When the height is too low, the last destinations move to "Plus" at the foot of the rail (section
 * 4.3); the badge of "Plus" then shows the unread count if the notifications are among them (decision 16).
 */
export function TabletRail({ pathname, viewer, unread }: TabletRailProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const height = useViewportHeight();
  const { visible, overflow } = splitForRail(NAV_ENTRIES, height);
  const toggleMore = () => setMoreOpen((open) => !open);

  return (
    <nav aria-label="Navigation principale" className={styles.railNav}>
      <Link href="/home" className={styles.logo} aria-label="Y, accueil">
        <YMark size={34} />
      </Link>
      <PosterButton variant="rail" />
      <ul className={styles.list}>
        {visible.map((entry) => (
          <li key={entry.id}>
            <NavLink entry={entry} viewer={viewer} pathname={pathname} unread={unread} variant="rail" />
          </li>
        ))}
        <li>
          <MoreTrigger
            variant="rail"
            expanded={moreOpen}
            badgeCount={moreBadgeCount(overflow, unread)}
            onClick={toggleMore}
          />
        </li>
      </ul>
      <AccountButton viewer={viewer} variant="rail" expanded={moreOpen} onClick={toggleMore} />
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
