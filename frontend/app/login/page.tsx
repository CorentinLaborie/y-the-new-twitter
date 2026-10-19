import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { ButtonYMark, buttonClassName } from '@/components/auth/button';
import { LegalNotice } from '@/components/auth/legal-notice';
import { LoginForm } from './login-form';
import styles from './login-screen.module.css';

export const metadata: Metadata = {
  title: 'Connexion — Y',
};

export default function LoginPage() {
  return (
    <div className={styles.screen}>
      <AuthShell
        screen="login"
        title="On ne demande jamais assez"
        accent="why ?"
        mark
        backLink={{ href: '/welcome', label: 'Retour' }}
        secondary={
          <Link href="/signup" className={buttonClassName('secondary')}>
            Rejoindre la communauté
            <ButtonYMark />
          </Link>
        }
        footnote={<LegalNotice action="connectant" />}
      >
        {/* The form reads the confirmation and the e-mail from the URL, which needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </AuthShell>
    </div>
  );
}
