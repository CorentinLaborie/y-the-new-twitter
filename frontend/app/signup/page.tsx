import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { LegalNotice } from '@/components/auth/legal-notice';
import { SignupForm } from './signup-form';
import styles from './signup-screen.module.css';

export const metadata: Metadata = {
  title: 'Inscription — Y',
};

export default function SignupPage() {
  return (
    <div className={styles.screen}>
      <AuthShell
        screen="signup"
        title="Nous rejoindre ?"
        accent="Why not ?"
        backLink={{ href: '/login', label: 'Retour' }}
        footnote={<LegalNotice action="inscrivant" />}
      >
        <SignupForm />
        {/* The divider above the legal line, as on the boards. The shell draws its own only with `secondary`. */}
        <div className={styles.divider} data-slot="divider" aria-hidden="true" />
      </AuthShell>
    </div>
  );
}
