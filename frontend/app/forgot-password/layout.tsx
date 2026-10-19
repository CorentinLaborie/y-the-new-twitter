import type { ReactNode } from 'react';
import { AuthFooter } from '@/components/auth/auth-footer';
import styles from './forgot-password.module.css';

/** Frame of the two steps: the board stage with the footer. Each page renders its own ForgotPanel. */
export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.root}>
      <div className={styles.stage}>
        {children}
        <div className={styles.footer}>
          <AuthFooter />
        </div>
      </div>
    </main>
  );
}
