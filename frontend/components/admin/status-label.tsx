import type { ReactNode } from 'react';
import type { StatusTone } from '@/lib/admin-labels';
import styles from './admin.module.css';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: styles.statusOk,
  open: styles.statusOpen,
  danger: styles.statusDanger,
  neutral: styles.statusNeutral,
};

/** A status written as text, with its colour as a reinforcement (the words always say the status). */
export function StatusLabel({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`${styles.status} ${TONE_CLASS[tone]}`}>{children}</span>;
}
