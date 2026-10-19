import Link from 'next/link';
import type { ReactNode } from 'react';
import { YIcon } from '@/components/brand/y-icon';
import { YMark } from '@/components/brand/y-mark';
import { AuthFooter } from './auth-footer';
import styles from './auth-shell.module.css';

type AuthScreen = 'login' | 'signup' | 'code' | 'welcome';

type AuthShellProps = {
  /** Which Auth board the screen follows. Each screen styles its own layout from `data-screen` (see its CSS file). */
  screen: AuthScreen;
  title: string;
  /** Short line under the title, underlined, as on the Auth boards. */
  accent?: string;
  /** The Y mark next to the title, shown from tablet width on the boards that have it. */
  mark?: boolean;
  backLink?: { href: string; label: string };
  children: ReactNode;
  /** Divider and button shown after the form, for example "Rejoindre la communauté". */
  secondary?: ReactNode;
  /** Legal line under the buttons. */
  footnote?: ReactNode;
};

/**
 * Layout shared by the guest pages. The elements carry `data-slot` attributes: each screen positions them
 * with the measures of its boards, in its own CSS file, so the markup stays the same on every screen.
 */
export function AuthShell({
  screen,
  title,
  accent,
  mark = false,
  backLink,
  children,
  secondary,
  footnote,
}: AuthShellProps) {
  return (
    <main className={styles.stage} data-screen={screen}>
      {mark ? (
        <div className={styles.mark} data-slot="mark" aria-hidden="true">
          <span className="y-logo y-logo-primary">
            <YMark size={480} />
          </span>
        </div>
      ) : null}
      {backLink ? (
        <Link href={backLink.href} className={styles.back} data-slot="back">
          <YIcon name="arrow-left" size={20} />
          {backLink.label}
        </Link>
      ) : null}
      <h1 className={styles.title} data-slot="title">
        {title}
      </h1>
      {accent ? (
        <p className={styles.accent} data-slot="accent">
          <span>{accent}</span>
        </p>
      ) : null}
      <div className={styles.auth} data-slot="auth">
        {children}
        {secondary ? (
          <>
            <div className={styles.divider} data-slot="divider" aria-hidden="true" />
            {secondary}
          </>
        ) : null}
        {footnote ? (
          <p className={styles.legal} data-slot="legal">
            {footnote}
          </p>
        ) : null}
      </div>
      <AuthFooter />
    </main>
  );
}
