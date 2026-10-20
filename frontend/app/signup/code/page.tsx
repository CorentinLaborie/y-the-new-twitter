import type { Metadata } from 'next';
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
        <CodeForm />
        <div className={styles.divider} data-slot="divider" aria-hidden="true" />
      </AuthShell>
    </div>
  );
}
