'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { Button } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import styles from '@/components/admin/admin.module.css';
import { adminLogin } from '@/lib/admin-api';
import { formatRetryAfter } from '@/lib/admin-format';
import { adminLoginFailure, CODE_REQUIRED_MESSAGE, SETUP_REQUIRED_MESSAGE } from '@/lib/admin-login';
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
 * Back-office sign-in. The password and the code are on the same screen: a correct password without a code gets the
 * code_required answer, and the form then asks for the code. After too many failures the API locks the form for a
 * delay (429, Retry-After): every field is disabled until the delay of the lock is over.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '', code: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<LoginField | 'code', HTMLInputElement | null>>>({});

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
    const code = values.code.trim();
    const result = await adminLogin(normalizeEmail(values.email), values.password, code || undefined);
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

    switch (result.body.status) {
      case 'ok':
        router.push('/admin');
        return;
      case 'code_required':
        setMessage(CODE_REQUIRED_MESSAGE);
        inputs.current.code?.focus();
        return;
      case 'setup_required':
        setMessage(SETUP_REQUIRED_MESSAGE);
        return;
    }
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
            <TextField
              id="admin-code"
              name="code"
              label="Code de vérification à 6 chiffres"
              hint="Code à usage unique de votre application d’authentification, ou un code de secours."
              placeholder="000000"
              autoComplete="one-time-code"
              value={values.code}
              onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))}
              ref={(element) => {
                inputs.current.code = element;
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
