'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { Button } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import styles from '@/components/admin/admin.module.css';
import { adminLogin } from '@/lib/admin-api';
import { formatRetryAfter } from '@/lib/admin-format';
import { adminLoginFailure } from '@/lib/admin-login';
import {
  firstErrorField,
  hasErrors,
  normalizeEmail,
  validateLogin,
  type FieldErrors,
  type LoginField,
} from '@/lib/validation';

const FIELD_ORDER: readonly LoginField[] = ['email', 'password'];

/**
 * Back-office sign-in with the email and the password. After too many failures the API locks the form for a delay
 * (429, Retry-After): every field is disabled until the delay of the lock is over.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<LoginField, HTMLInputElement | null>>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const fieldErrors = validateLogin({ email: values.email, password: values.password });
    if (hasErrors(fieldErrors)) {
      setErrors(fieldErrors);
      const field = firstErrorField(fieldErrors, FIELD_ORDER);
      if (field) {
        inputs.current[field]?.focus();
      }
      return;
    }

    setErrors({});
    setSubmitting(true);
    const result = await adminLogin(normalizeEmail(values.email), values.password);
    setSubmitting(false);

    if (!result.ok) {
      const failure = adminLoginFailure(result.problem);
      if (failure.kind === 'locked') {
        setLockedFor(failure.retryAfterSeconds);
      } else {
        setMessage(failure.message);
      }
      return;
    }

    router.push('/admin');
  }

  const locked = lockedFor !== null;

  return (
    <main className={styles.login}>
      <div aria-hidden="true">
        <YMark size={320} />
      </div>
      <div className={styles.loginColumn}>
        <p className={styles.loginKicker}>Administration</p>
        <h1 className={styles.loginTitle}>Connexion au back-office</h1>
        {lockedFor !== null ? (
          <div className={styles.alert} role="alert">
            <strong>Connexion bloquée</strong>
            <span>Trop d’échecs de connexion. Réessayez dans {formatRetryAfter(lockedFor)}.</span>
          </div>
        ) : null}
        {message && !locked ? (
          <p role="alert" className={styles.alert}>
            {message}
          </p>
        ) : null}
        <form className={styles.loginForm} noValidate onSubmit={handleSubmit}>
          <fieldset disabled={locked || submitting}>
            <TextField
              id="admin-email"
              name="email"
              type="email"
              label="Adresse e-mail"
              placeholder="Votre adresse e-mail"
              autoComplete="username"
              spellCheck={false}
              value={values.email}
              onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
              error={errors.email}
              ref={(element) => {
                inputs.current.email = element;
              }}
            />
            <TextField
              id="admin-password"
              name="password"
              type="password"
              label="Mot de passe"
              placeholder="Votre mot de passe"
              revealable
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
              error={errors.password}
              ref={(element) => {
                inputs.current.password = element;
              }}
            />
            <Button type="submit">{submitting ? 'Connexion…' : 'Se connecter'}</Button>
          </fieldset>
        </form>
        <p className={styles.loginNote}>Connexion réservée à l’administrateur</p>
      </div>
    </main>
  );
}
