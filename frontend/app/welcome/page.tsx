import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { LegalNotice } from '@/components/auth/legal-notice';
import { ButtonYMark, buttonClassName } from '@/components/auth/button';
import styles from './welcome-screen.module.css';

export const metadata: Metadata = {
  title: 'Bienvenue — Y',
};

/** Welcome screen, from the Auth-Welcome boards: mobile (360 x 667), tablet (768 x 1024) and desktop (1440 x 950). */
export default function WelcomePage() {
  return (
    <div className={styles.screen}>
      <AuthShell
        screen="welcome"
        title="On ne demande jamais assez"
        accent="why ?"
        mark
        secondary={
          <Link href="/signup" className={buttonClassName('secondary')}>
            Rejoindre la communauté
            <ButtonYMark />
          </Link>
        }
        footnote={<LegalNotice action="connectant" />}
      >
        <Link href="/login" className={buttonClassName('primary')}>
          Se connecter
        </Link>
      </AuthShell>
    </div>
  );
}
