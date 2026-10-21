'use client';

import { useEffect, type ReactNode } from 'react';
import styles from '@/components/admin/admin.module.css';

/**
 * A modal of the back-office: a scrim over the page and a dialog labelled by its title. Escape closes it. The screen
 * that opens it keeps the focus inside its fields, which take it on their own (autofocus).
 */
export function AdminDialog({
  titleId,
  title,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className={styles.scrim}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
