import type { ReactNode } from 'react';
import styles from './admin.module.css';

/** Header of a back-office page: its title, and the reminder that the page is for the administrator only. */
export function AdminPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className={styles.pageHead}>
        <h1>{title}</h1>
        <span className={styles.pageNote}>Accès réservé à l’administrateur</span>
      </header>
      <div className={styles.body}>{children}</div>
    </>
  );
}
