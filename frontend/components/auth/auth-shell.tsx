import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './auth-shell.module.css';

type AuthShellProps = {
  title: string;
  /** Short line under the title, underlined, as on the Auth boards. */
  accent?: string;
  backLink?: { href: string; label: string };
  children: ReactNode;
  /** Button or link shown after the divider, for example "Rejoindre la communauté". */
  secondary?: ReactNode;
  footnote?: ReactNode;
};

/** Shared layout of the guest pages (login, signup, code): one column, centred, 16 px gutters. */
export function AuthShell({ title, accent, backLink, children, secondary, footnote }: AuthShellProps) {
  return (
    <main className={styles.page}>
      {backLink ? (
        <Link href={backLink.href} className={styles.back}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5m0 0 7-7m-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {backLink.label}
        </Link>
      ) : null}
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {accent ? (
          <p className={styles.accent}>
            <span>{accent}</span>
          </p>
        ) : null}
      </header>
      <div className={styles.body}>{children}</div>
      {secondary || footnote ? (
        <div className={styles.footer}>
          <div className={styles.divider} aria-hidden="true" />
          {secondary}
          {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
