'use client';

import { useEffect, useId, useState } from 'react';
import { getSession, type SessionUser } from '@/lib/auth-api';
import { ContactForm } from './contact-form';
import styles from './suspended-banner.module.css';

/** What the banner shows for a suspended account: the reason, or null when the API gives none. */
type Suspension = { reason: string | null };

/** The reason of the suspension, as the session answer gives it (DEC-077, DEC-081). Blank means none. */
function readSuspensionReason(user: SessionUser): string | null {
  const reason = user.suspensionReason?.trim() ?? '';
  return reason === '' ? null : reason;
}

/**
 * Banner of a suspended account (section 3.4, section 12.6). Mounted in the protected layout. It reads the session in the
 * browser: nothing is shown for an active account, a guest, or when the API cannot say. The publishing controls are
 * refused by the API itself (R13, 403).
 */
export function SuspendedBanner() {
  const [suspension, setSuspension] = useState<Suspension | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formId = useId();
  const titleId = useId();

  useEffect(() => {
    let current = true;
    getSession().then((result) => {
      const user = result.ok ? result.body.user : null;
      if (current && user?.status === 'suspended') {
        setSuspension({ reason: readSuspensionReason(user) });
      }
    });
    return () => {
      current = false;
    };
  }, []);

  if (suspension === null) {
    return null;
  }

  const reasonText = suspension.reason === null ? '' : ` Motif : ${suspension.reason}.`;

  return (
    <section className={styles.banner} aria-labelledby={titleId}>
      <p id={titleId} className={styles.text}>
        Votre compte est suspendu.{reasonText} Pour toute question, contactez-nous à l’adresse indiquée dans
        les mentions légales.
      </p>
      <button
        type="button"
        className={`y-btn y-btn-outline y-btn-sm ${styles.toggle}`}
        aria-expanded={formOpen}
        aria-controls={formId}
        onClick={() => setFormOpen((open) => !open)}
      >
        Contacter l’administrateur
      </button>
      <div id={formId} className={styles.form} hidden={!formOpen}>
        {formOpen ? <ContactForm /> : null}
      </div>
    </section>
  );
}
