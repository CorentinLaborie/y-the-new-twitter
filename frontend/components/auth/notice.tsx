import type { ReactNode } from 'react';
import styles from './notice.module.css';

type NoticeTone = 'error' | 'success' | 'info';

/**
 * Message of a form or of a page. Errors use role="alert", confirmations and information use role="status"
 * (aria-live polite). The text itself says what happened: the colour only reinforces it.
 */
export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${styles[tone]}`}>
      {children}
    </div>
  );
}
