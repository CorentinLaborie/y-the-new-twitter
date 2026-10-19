'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/auth/button';
import formStyles from '@/components/auth/form.module.css';
import { loginProblemMessage } from '@/components/auth/messages';
import { Notice } from '@/components/auth/notice';
import { TextField } from '@/components/auth/text-field';
import { login } from '@/lib/auth-api';
import { DEFAULT_AFTER_LOGIN_PATH, safeNextPath } from '@/lib/route-guard';
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
 * Login form. Reads two optional parameters set by the code page: `verified=1` shows the confirmation,
 * and `email` pre-fills the address.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  const [values, setValues] = useState(() => ({ email: searchParams.get('email') ?? '', password: '' }));
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [pending, setPending] = useState(false);
  const inputs = useRef<Partial<Record<LoginField, HTMLInputElement | null>>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setUnverified(false);

    const found = validateLogin(values);
    if (hasErrors(found)) {
      setErrors(found);
      const field = firstErrorField(found, FIELD_ORDER);
      if (field) {
        inputs.current[field]?.focus();
      }
      return;
    }

    setErrors({});
    setPending(true);
    const result = await login(normalizeEmail(values.email), values.password);
    if (result.ok) {
      // Back to the page the user asked for (?next=, checked by safeNextPath), else the protected home.
      router.push(safeNextPath(searchParams.get('next')) ?? DEFAULT_AFTER_LOGIN_PATH);
      return;
    }

    setPending(false);
    setFormError(loginProblemMessage(result.problem).message);
    setUnverified(result.problem.status === 403);
  }

  return (
    <form className={formStyles.form} noValidate onSubmit={handleSubmit}>
      {verified ? (
        <Notice tone="success">Votre compte est validé. Connectez-vous pour continuer.</Notice>
      ) : null}
      <div className={formStyles.stack}>
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
              <Link href={`/signup/code?email=${encodeURIComponent(normalizeEmail(values.email))}`}>
                Saisir mon code
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
