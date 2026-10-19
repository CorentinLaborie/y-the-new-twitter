import { Suspense } from 'react';
import Link from 'next/link';
import { ForgotPanel } from '../forgot-panel';
import { ConfirmForm } from './confirm-form';
import styles from '../forgot-password.module.css';

type ConfirmPageProps = {
  searchParams: Promise<{ email?: string | string[] }>;
};

/** Step 2: code and new password. The e-mail address comes from the query string of step 1. */
export default function ConfirmPage({ searchParams }: ConfirmPageProps) {
  return (
    <ForgotPanel>
      <Suspense fallback={null}>
        <ConfirmStep searchParams={searchParams} />
      </Suspense>
    </ForgotPanel>
  );
}

/** Reads the query string inside Suspense, as Cache Components requires (NEXTJS-DIGEST, runtime APIs). */
async function ConfirmStep({ searchParams }: ConfirmPageProps) {
  const { email } = await searchParams;
  const address = typeof email === 'string' ? email : null;

  if (!address) {
    return (
      <>
        <p className={styles.lead}>Saisissez d’abord votre adresse e-mail pour recevoir un code.</p>
        <p className={styles.note}>
          <Link className={styles.link} href="/forgot-password">
            Saisir mon adresse e-mail
          </Link>
        </p>
      </>
    );
  }

  return <ConfirmForm email={address} />;
}
