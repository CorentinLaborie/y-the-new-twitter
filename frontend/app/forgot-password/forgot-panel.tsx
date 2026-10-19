import type { ReactNode } from 'react';
import Link from 'next/link';
import { YIcon } from '@/components/brand/y-icon';
import { YMark } from '@/components/brand/y-mark';
import styles from './forgot-password.module.css';

type ForgotPanelProps = {
  children: ReactNode;
  /** The Y mark at the left of the form, from tablet width. Only the first step shows it. */
  mark?: boolean;
  /** "Retour" link at the top left, mobile only (mobile board). */
  back?: { href: string; label: string };
};

/**
 * Frame of one step, as on the Auth-ForgotPassword boards: the title, the step's form, and the way back to the
 * login screen. Positions are set by the layout's stage (forgot-password.module.css).
 */
export function ForgotPanel({ children, mark = false, back }: ForgotPanelProps) {
  return (
    <>
      {mark ? (
        <div className={styles.logo} aria-hidden="true">
          <span className="y-logo y-logo-primary">
            <YMark size={440} />
          </span>
        </div>
      ) : null}
      {back ? (
        <Link className={styles.back} href={back.href}>
          <YIcon name="arrow-left" size={18} />
          {back.label}
        </Link>
      ) : null}
      <div className={styles.column}>
        <h1 className={styles.title}>Mot de passe oublié</h1>
        {children}
        <p className={styles.note}>
          Vous vous souvenez de votre mot de passe ?{' '}
          <Link className={styles.link} href="/login">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </>
  );
}
