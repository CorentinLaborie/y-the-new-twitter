'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MessagesScreen } from './messages-screen';
import styles from './messages.module.css';

/**
 * The Messages area of the 07 boards: the list of conversations on the left, the open conversation (or the empty pane)
 * on the right. Under 1024 px the list and the pane are shown one at a time, as before. The new message page has its
 * own two columns and is shown on its own.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/messages/new')) {
    return <>{children}</>;
  }
  const view = pathname === '/messages' ? 'list' : 'thread';

  return (
    <div className={styles.shell} data-view={view}>
      <section aria-label="Conversations" className={styles.listColumn}>
        <header className={styles.listHeader}>
          <h1 className={styles.title}>Messages</h1>
          <Link href="/messages/new" aria-label="Nouveau message" className={styles.iconButton}>
            +
          </Link>
        </header>
        <MessagesScreen />
      </section>
      <div className={styles.pane}>{children}</div>
    </div>
  );
}
