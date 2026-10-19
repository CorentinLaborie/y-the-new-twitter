import type { ReactNode } from 'react';
import styles from './legal-document.module.css';

/** Frame of a legal page: the title and the text. The text is a placeholder until the wording is written. */
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </main>
  );
}
