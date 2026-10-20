'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/auth/button';
import formStyles from '@/components/auth/form.module.css';
import { loginProblemMessage, SESSION_EXPIRED_MESSAGE } from '@/components/auth/messages';
import { Notice } from '@/components/auth/notice';
import { TextField } from '@/components/auth/text-field';
import { login } from '@/lib/auth-api';
import { rememberPendingEmail, takePendingEmail } from '@/lib/pending-email';
import { DEFAULT_AFTER_LOGIN_PATH, safeNextPath } from '@/lib/route-guard';
import { SESSION_EXPIRED_REASON } from '@/lib/session-expired';
import {
  firstErrorField,
  hasErrors,
  normalizeEmail,
  validateLogin,
  type FieldErrors,
  type LoginField,
} from '@/lib/validation';
import styles from './login-screen.module.css';

const FIELD_ORDER: readonly LoginField[] = ['email', 'password'];

/**
 * Login form. The `verified=1` parameter shows the confirmation of the code page. The `reason=session-expired`
 * parameter (set when a protected call answers 401) shows that the session has ended. The address of a just verified
 * account (or of the code page link) comes from sessionStorage, not from the URL, and pre-fills the field.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  const sessionExpired = searchParams.get('reason') === SESSION_EXPIRED_REASON;
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<LoginField, HTMLInputElement | null>>>({});
  const pendingEmailRead = useRef(false);

  // Read after the first render (the server has no storage), and once (React runs effects twice in development).
  useEffect(() => {
    if (pendingEmailRead.current) {
      return;
    }
    pendingEmailRead.current = true;
    setValues((current) => ({ ...current, email: takePendingEmail() ?? current.email }));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setUnverified(false);

    const fieldErrors = validateLogin(values);
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
    const result = await login(normalizeEmail(values.email), values.password);
    if (result.ok) {
      // Back to the page the user asked for (?next=, checked by safeNextPath), else the protected home.
      router.push(safeNextPath(searchParams.get('next')) ?? DEFAULT_AFTER_LOGIN_PATH);
      return;
    }

    setSubmitting(false);
    setFormError(loginProblemMessage(result.problem).message);
    setUnverified(result.problem.status === 403);
  }

  return (
    <>
      {sessionExpired ? <Notice tone="info">{SESSION_EXPIRED_MESSAGE}</Notice> : null}
      <form className={[formStyles.form, styles.form].join(' ')} noValidate onSubmit={handleSubmit}>
        {verified ? (
          <Notice tone="success">Votre compte est validé. Connectez-vous pour continuer.</Notice>
        ) : null}
        <div className={[formStyles.stack, styles.fields].join(' ')}>
          <TextField
            id="email"
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
            id="password"
            name="password"
            type="password"
            label="Mot de passe"
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            value={values.password}
            onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
            error={errors.password}
            ref={(element) => {
              inputs.current.password = element;
            }}
          />
        </div>
        {formError ? (
          <Notice tone="error">
            {formError}
            {unverified ? (
              <>
                {' '}
                <Link href="/signup/code" onClick={() => rememberPendingEmail(normalizeEmail(values.email))}>
                  Saisir mon code
                </Link>
              </>
            ) : null}
          </Notice>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>
    </>
  );
}
