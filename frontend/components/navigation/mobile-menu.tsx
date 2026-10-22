'use client';

import { useRef } from 'react';
import { YIcon } from '@/components/brand/y-icon';
import { NAV_ENTRIES, type NavViewer } from './nav-items';
import { NavLink } from './nav-link';
import { PosterButton } from './poster-button';
import { SecondaryLinks } from './secondary-links';
import styles from './navigation.module.css';
import { useDialog } from './use-dialog';

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  pathname: string;
  viewer: NavViewer;
  unread: number;
};

/**
 * Full-screen menu of the mobile, opened from the top bar (plan L0, section 5.4, decision 1). It lists the seven
 * destinations, "Poster", and the settings, the help pages and the sign-out. Escape or the close button closes it.
 */
export function MobileMenu({ open, onClose, pathname, viewer, unread }: MobileMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(open, panelRef, onClose);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      tabIndex={-1}
      className={styles.fullMenu}
    >
      <div className={styles.fullMenuHeader}>
        <button type="button" className={styles.closeButton} aria-label="Fermer le menu" onClick={onClose}>
          <YIcon name="x" size={24} />
        </button>
      </div>
      <nav aria-label="Destinations">
        <ul className={styles.fullMenuList}>
          {NAV_ENTRIES.map((entry) => (
            <li key={entry.id}>
              <NavLink
                entry={entry}
                viewer={viewer}
                pathname={pathname}
                unread={unread}
                variant="sheet"
                onNavigate={onClose}
              />
            </li>
          ))}
        </ul>
      </nav>
      <PosterButton variant="menu" onNavigate={onClose} />
      <SecondaryLinks onNavigate={onClose} />
    </div>
  );
}
