'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { DesktopSidebar } from './desktop-sidebar';
import type { NavViewer } from './nav-items';
import { MobileBottomBar } from './mobile-bottom-bar';
import { MobileTopBar } from './mobile-top-bar';
import styles from './app-shell.module.css';
import { TabletRail } from './tablet-rail';
import { useUnreadCount } from './use-unread-count';

/**
 * Shell of the signed-in area (plan L0, sections 4 and 5). It renders the navigation of the three widths; CSS shows
 * one of them (sidebar from 1280 px, rail from 768 px, top and bottom bars under 768 px). The unread count is read
 * again on each page change, and feeds the badge of every variant.
 */
export function AppShell({ viewer, children }: { viewer: NavViewer; children: ReactNode }) {
  const pathname = usePathname();
  const unread = useUnreadCount(pathname);

  return (
    <div className={styles.shell}>
      <DesktopSidebar pathname={pathname} viewer={viewer} unread={unread} />
      <TabletRail pathname={pathname} viewer={viewer} unread={unread} />
      <MobileTopBar pathname={pathname} viewer={viewer} unread={unread} />
      <div className={styles.content}>{children}</div>
      <MobileBottomBar pathname={pathname} viewer={viewer} unread={unread} />
    </div>
  );
}
