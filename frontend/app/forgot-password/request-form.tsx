'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { requestPasswordReset } from '@/lib/auth-api';
import { isValidEmail, EMAIL_INVALID_MESSAGE } from './email-rule';
import { TextInput } from './field';
import { requestErrorMessage } from './messages';
import styles from './forgot-password.module.css';

/**
 * Step 1: the e-mail address. Whatever the account state, a 202 answer leads to the code step, so the screen
 * never says whether the address has an account (product doc 13, enumeration protection).
 */
export function RequestForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();

    if (!isValidEmail(address)) {
      setFormError(null);
      setEmailError(EMAIL_INVALID_MESSAGE);
      inputRef.current?.focus();
      return;
    }

    setEmailError(null);
    setFormError(null);
    setPending(true);
    const result = await requestPasswordReset(address);
    if (result.ok) {
      router.push(`/forgot-password/confirm?email=${encodeURIComponent(address)}`);
      return;
    }

    setPending(false);
    setFormError(requestErrorMessage(result.problem));
  }

  return (
    <>
      <p className={styles.lead}>
        Saisissez l’adresse e-mail de votre compte. Nous vous enverrons un code pour réinitialiser votre mot
        de passe.
      </p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextInput
          ref={inputRef}
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
        <button type="submit" className={styles.button} disabled={pending}>
          {pending ? 'Envoi en cours…' : 'Envoyer le code'}
        </button>
      </form>
    </>
  );
}
