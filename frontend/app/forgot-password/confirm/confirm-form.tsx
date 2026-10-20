'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, buttonClassName } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import { confirmPasswordReset } from '@/lib/auth-api';
import { CONFIRMATION_MESSAGE, confirmErrorMessage } from '../messages';
import { passwordProblem, PASSWORD_RULE_HINT } from '../password-rule';
import styles from '../forgot-password.module.css';

const CODE_PATTERN = /^\d{6}$/;
const CODE_INVALID_MESSAGE = 'Le code contient six chiffres.';

type ConfirmFormProps = { email: string };

/** Step 2: the six-digit code from the e-mail, and the new password (same policy as signup, DEC-136). */
export function ConfirmForm({ email }: ConfirmFormProps) {
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enteredCode = code.trim();
    const codeProblem = CODE_PATTERN.test(enteredCode) ? null : CODE_INVALID_MESSAGE;
    const newPasswordProblem = passwordProblem(password);

    setCodeError(codeProblem);
    setPasswordError(newPasswordProblem);
    setFormError(null);
    if (codeProblem || newPasswordProblem) {
      (codeProblem ? codeRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    const result = await confirmPasswordReset(email, enteredCode, password);
    setSubmitting(false);
    if (result.ok) {
      setPassword('');
      setDone(true);
      doneRef.current?.focus();
      return;
    }
    setFormError(confirmErrorMessage(result.problem));
  }

  if (done) {
    return (
      <>
        <p ref={doneRef} tabIndex={-1} role="status" className={styles.status}>
          Votre mot de passe a été changé.
        </p>
        <Link className={buttonClassName('primary')} href="/login">
          Se connecter
        </Link>
      </>
    );
  }

  return (
    <>
      <p role="status" className={styles.status}>
        {CONFIRMATION_MESSAGE}
      </p>
      <p className={styles.lead}>
        Saisissez le code à six chiffres reçu par e-mail, puis choisissez un nouveau mot de passe.
      </p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          ref={codeRef}
          id="forgot-code"
          name="code"
          label="Code à 6 chiffres"
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={codeError ?? undefined}
        />
        <TextField
          ref={passwordRef}
          id="forgot-new-password"
          name="password"
          type="password"
          revealable
          label="Nouveau mot de passe"
          placeholder="Votre nouveau mot de passe"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={PASSWORD_RULE_HINT}
          error={passwordError ?? undefined}
        />
        {formError ? (
          <p role="alert" className={styles.alert}>
            {formError}{' '}
            <Link className={styles.link} href="/forgot-password">
              Demander un nouveau code
            </Link>
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Envoi en cours…' : 'Changer mon mot de passe'}
        </Button>
      </form>
    </>
  );
}
