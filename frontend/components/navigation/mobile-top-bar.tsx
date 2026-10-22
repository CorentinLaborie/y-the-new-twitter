'use client';

import Link from 'next/link';
import { useState } from 'react';
import { YIcon } from '@/components/brand/y-icon';
import { YMark } from '@/components/brand/y-mark';
import { MobileMenu } from './mobile-menu';
import type { NavViewer } from './nav-items';
import styles from './navigation.module.css';

type MobileTopBarProps = {
  pathname: string;
  viewer: NavViewer;
  unread: number;
};

/**
 * Top bar of the mobile (plan L0, section 5.4, decision 3): logo, the menu button and, when a notification is unread,
 * a dot on the menu button. The button opens the full-screen menu.
 */
export function MobileTopBar({ pathname, viewer, unread }: MobileTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasUnread = unread > 0;

  return (
    <header className={styles.topBar}>
      <Link href="/home" className={styles.logo} aria-label="Y, accueil">
        <YMark size={30} />
      </Link>
      <button
        type="button"
        className={styles.menuButton}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-label={hasUnread ? 'Ouvrir le menu, notifications non lues' : 'Ouvrir le menu'}
        onClick={() => setMenuOpen(true)}
      >
        <YIcon name="menu" size={24} />
        {hasUnread ? <span className={styles.dot} aria-hidden="true" /> : null}
      </button>
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pathname={pathname}
        viewer={viewer}
        unread={unread}
      />
    </header>
  );
}
