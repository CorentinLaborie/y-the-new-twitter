import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './forgot-password.module.css';

/** Shared frame of the two steps: title and way back to the login screen. */
export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Mot de passe oublié</h1>
      {children}
      <p className={styles.note}>
        Vous vous souvenez de votre mot de passe ?{' '}
        <Link className={styles.link} href="/login">
          Retour à la connexion
        </Link>
      </p>
    </main>
  );
}
