'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/auth/button';
import formStyles from '@/components/auth/form.module.css';
import { resendProblemMessage, verifyProblemMessage } from '@/components/auth/messages';
import { Notice } from '@/components/auth/notice';
import { TextField } from '@/components/auth/text-field';
import { resendSignupCode, verifySignup } from '@/lib/auth-api';
import { rememberPendingEmail, takePendingEmail } from '@/lib/pending-email';
import { normalizeEmail, validateCode, validateEmail } from '@/lib/validation';

const RESEND_CONFIRMATION = 'Si cette adresse peut être utilisée, un nouveau code vient de vous être envoyé.';

/** Form of the six-digit code. The e-mail comes from the signup page, through sessionStorage. */
export function CodeForm() {
  const router = useRouter();
  // undefined until the browser has read the address: the server render shows nothing, so both renders match.
  const [pendingEmail, setPendingEmail] = useState<string | null | undefined>(undefined);
  const pendingEmailRead = useRef(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<'verify' | 'resend' | null>(null);
  const codeInput = useRef<HTMLInputElement | null>(null);

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

  const email = normalizeEmail(pendingEmail ?? '');
  if (validateEmail(email) !== undefined) {
    return (
      <Notice tone="error">
        Adresse e-mail manquante ou invalide. <Link href="/signup">Recommencer l’inscription</Link>.
      </Notice>
    );
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setConfirmation(null);

    const enteredCode = code.trim();
    const codeProblem = validateCode(enteredCode);
    if (codeProblem !== undefined) {
      setCodeError(codeProblem);
      codeInput.current?.focus();
      return;
    }

    setCodeError(undefined);
    setActiveAction('verify');
    const result = await verifySignup(email, enteredCode);
    if (result.ok) {
      rememberPendingEmail(email);
      router.push('/login?verified=1');
      return;
    }

    setActiveAction(null);
    const problemMessage = verifyProblemMessage(result.problem);
    if (problemMessage.field) {
      setCodeError(problemMessage.message);
      codeInput.current?.focus();
    } else {
      setFormError(problemMessage.message);
    }
  }

  async function handleResend() {
    setFormError(null);
    setConfirmation(null);
    setActiveAction('resend');
    const result = await resendSignupCode(email);
    setActiveAction(null);

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
      <Button type="submit" disabled={activeAction !== null}>
        {activeAction === 'verify' ? 'Validation…' : 'Valider mon compte'}
      </Button>
      <Button variant="secondary" onClick={handleResend} disabled={activeAction !== null}>
        {activeAction === 'resend' ? 'Envoi…' : 'Renvoyer le code'}
      </Button>
    </form>
  );
}
