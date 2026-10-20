'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { takePendingEmail } from '@/lib/pending-email';
import { ConfirmForm } from './confirm-form';
import styles from '../forgot-password.module.css';

/** Chooses what step 2 shows: the form when step 1 handed over an address, else a link back to step 1. */
export function ConfirmStep() {
  // undefined until the browser has read the address: the server render shows nothing, so both renders match.
  const [pendingEmail, setPendingEmail] = useState<string | null | undefined>(undefined);
  const pendingEmailRead = useRef(false);

  // Read once: React runs effects twice in development (StrictMode), and the second read would find nothing.
  useEffect(() => {
    if (pendingEmailRead.current) {
      return;
    }
    pendingEmailRead.current = true;
    setPendingEmail(takePendingEmail());
  }, []);

  if (pendingEmail === undefined) {
    return null;
  }

  if (pendingEmail === null) {
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

  return <ConfirmForm email={pendingEmail} />;
}
