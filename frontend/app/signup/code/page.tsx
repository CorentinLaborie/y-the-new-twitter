import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { LegalNotice } from '@/components/auth/legal-notice';
import { CodeForm } from './code-form';
import styles from './code-screen.module.css';

export const metadata: Metadata = {
  title: 'Code de validation — Y',
};

export default function SignupCodePage() {
  return (
    // The wrapper gives every selector of the screen CSS a local class (CSS module rule); it adds no layout.
    <div className={styles.screen}>
      <AuthShell
        screen="code"
        title="Nous rejoindre ?"
        accent="Why not ?"
        backLink={{ href: '/signup', label: 'Retour' }}
        footnote={<LegalNotice action="inscrivant" />}
      >
        {/* The form reads the e-mail from the URL, which needs a Suspense boundary (Cache Components). */}
        <Suspense fallback={null}>
          <CodeForm />
        </Suspense>
        <div className={styles.divider} data-slot="divider" aria-hidden="true" />
      </AuthShell>
    </div>
  );
}
