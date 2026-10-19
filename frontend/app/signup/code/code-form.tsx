'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/auth/button';
import formStyles from '@/components/auth/form.module.css';
import { resendProblemMessage, verifyProblemMessage } from '@/components/auth/messages';
import { Notice } from '@/components/auth/notice';
import { TextField } from '@/components/auth/text-field';
import { resendSignupCode, verifySignup } from '@/lib/auth-api';
import { normalizeEmail, validateCode, validateEmail } from '@/lib/validation';

const RESEND_CONFIRMATION = 'Si cette adresse peut être utilisée, un nouveau code vient de vous être envoyé.';

/** Form of the six-digit code. The e-mail comes from the URL (/signup/code?email=...). */
export function CodeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = normalizeEmail(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null);
  const codeInput = useRef<HTMLInputElement | null>(null);

  if (validateEmail(email) !== undefined) {
    return (
      <Notice tone="error">
        Adresse e-mail manquante ou invalide. <Link href="/signup">Recommencer l’inscription</Link>
      </Notice>
    );
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setConfirmation(null);

    const trimmed = code.trim();
    const error = validateCode(trimmed);
    if (error !== undefined) {
      setCodeError(error);
      codeInput.current?.focus();
      return;
    }

    setCodeError(undefined);
    setPending('verify');
    const result = await verifySignup(email, trimmed);
    if (result.ok) {
      router.push(`/login?verified=1&email=${encodeURIComponent(email)}`);
      return;
    }

    setPending(null);
    const problem = verifyProblemMessage(result.problem);
    if (problem.field) {
      setCodeError(problem.message);
      codeInput.current?.focus();
    } else {
      setFormError(problem.message);
    }
  }

  async function handleResend() {
    setFormError(null);
    setConfirmation(null);
    setPending('resend');
    const result = await resendSignupCode(email);
    setPending(null);

    if (result.ok) {
      setConfirmation(RESEND_CONFIRMATION);
    } else {
      setFormError(resendProblemMessage(result.problem).message);
    }
  }

  return (
    <form className={formStyles.form} noValidate onSubmit={handleVerify}>
      <TextField
        id="code"
        name="code"
        label="Entrez le code reçu par e-mail"
        placeholder="6 chiffres"
        hint="Cette mesure nous sert à vérifier que votre adresse e-mail est bien valide."
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        error={codeError}
        ref={codeInput}
      />
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      {confirmation ? <Notice tone="success">{confirmation}</Notice> : null}
      <Button type="submit" disabled={pending !== null}>
        {pending === 'verify' ? 'Validation…' : 'Valider mon compte'}
      </Button>
      <Button variant="secondary" onClick={handleResend} disabled={pending !== null}>
        {pending === 'resend' ? 'Envoi…' : 'Renvoyer le code'}
      </Button>
    </form>
  );
}
