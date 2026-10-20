'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import { requestPasswordReset } from '@/lib/auth-api';
import { rememberPendingEmail } from '@/lib/pending-email';
import { isValidEmail, EMAIL_INVALID_MESSAGE } from './email-rule';
import { requestErrorMessage } from './messages';
import styles from './forgot-password.module.css';

/**
 * Step 1: the e-mail enteredEmail. Whatever the account state, a 202 answer leads to the code step, so the screen
 * never says whether the enteredEmail has an account (product doc 13, enumeration protection).
 */
export function RequestForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredEmail = email.trim();

    if (!isValidEmail(enteredEmail)) {
      setFormError(null);
      setEmailError(EMAIL_INVALID_MESSAGE);
      inputRef.current?.focus();
      return;
    }

    setEmailError(null);
    setFormError(null);
    setSubmitting(true);
    const result = await requestPasswordReset(enteredEmail);
    if (result.ok) {
      rememberPendingEmail(enteredEmail);
      router.push('/forgot-password/confirm');
      return;
    }

    setSubmitting(false);
    setFormError(requestErrorMessage(result.problem));
  }

  return (
    <>
      <p className={styles.lead}>
        Saisissez l’adresse e-mail de votre compte. Nous vous enverrons un code pour réinitialiser votre mot
        de passe.
      </p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          ref={inputRef}
          id="forgot-email"
          name="email"
          type="email"
          label="Adresse e-mail"
          placeholder="nom@exemple.fr"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError ?? undefined}
        />
        {formError ? (
          <p role="alert" className={styles.alert}>
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Envoi en cours…' : 'Envoyer le code'}
        </Button>
      </form>
    </>
  );
}
