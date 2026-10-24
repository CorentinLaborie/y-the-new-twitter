'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { tooManyAttemptsMessage } from '@/components/auth/messages';
import type { ApiProblem } from '@/lib/api-client';
import { confirmEmailChange, requestEmailChange, resendEmailChange } from '@/lib/settings-api';

const INSTRUCTIONS =
  'Un code de confirmation sera envoyé à la nouvelle adresse. Votre adresse actuelle recevra aussi un e-mail pour l’informer de ce changement.';
const CODE_INVALID = 'Le code est incorrect ou a expiré.';
const ADDRESS_TAKEN = 'Cette adresse e-mail est déjà utilisée.';
const RESENT_MESSAGE = 'Un nouveau code a été envoyé.';
const SUCCESS_MESSAGE = 'Votre adresse a été modifiée.';
const CONNECTION_ERROR = 'Le serveur est injoignable.';

type Step = 'address' | 'code' | 'done';

/** The message of a refusal on the code step (plan L5, 6.3). */
function codeProblemMessage(problem: ApiProblem): string {
  if (problem.status === 422) {
    return CODE_INVALID;
  }
  if (problem.status === 409) {
    return ADDRESS_TAKEN;
  }
  if (problem.status === 429) {
    return tooManyAttemptsMessage(problem);
  }
  return problem.status === 0 ? CONNECTION_ERROR : problem.detail;
}

/*
 * The change of address in two steps (plan L5, section 6.3): the new address and the current password, then the
 * six-digit code. The first step moves on whatever the server answers (202), so the form reveals nothing. Resending is
 * limited by the server; the button stays available.
 */
export function EmailChangeForm() {
  const [step, setStep] = useState<Step>('address');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function sendAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    setMessage(null);
    setSending(true);
    const result = await requestEmailChange(newEmail.trim(), password);
    setSending(false);
    if (result.ok) {
      setPassword('');
      setStep('code');
      return;
    }
    if (result.problem.status === 422) {
      setMessage(result.problem.detail);
      setIsError(true);
      return;
    }
    setMessage(result.problem.status === 0 ? CONNECTION_ERROR : result.problem.detail);
    setIsError(true);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    setMessage(null);
    setSending(true);
    const result = await confirmEmailChange(code);
    setSending(false);
    if (result.ok) {
      setCode('');
      setStep('done');
      setMessage(SUCCESS_MESSAGE);
      setIsError(false);
      return;
    }
    setCode('');
    setMessage(codeProblemMessage(result.problem));
    setIsError(true);
  }

  async function resend() {
    setMessage(null);
    const result = await resendEmailChange();
    if (result.ok) {
      setMessage(RESENT_MESSAGE);
      setIsError(false);
      return;
    }
    setMessage(codeProblemMessage(result.problem));
    setIsError(true);
  }

  if (step === 'done') {
    return (
      <div>
        <p role="status" tabIndex={-1}>
          {SUCCESS_MESSAGE}
        </p>
        <Link href="/settings">Retour aux paramètres</Link>
      </div>
    );
  }

  return (
    <>
      {step === 'address' ? (
        <form onSubmit={sendAddress} noValidate aria-busy={sending}>
          <p>{INSTRUCTIONS}</p>
          <div>
            <label htmlFor="email-new-address">Nouvelle adresse e-mail</label>
            <input
              id="email-new-address"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
            />
          </div>
          <div>
            <label htmlFor="email-password">Mot de passe actuel</label>
            <input
              id="email-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
            />
          </div>
          <button type="submit" className="y-btn y-btn-md y-btn-primary y-btn-pill" style={{ minHeight: 44, marginTop: 16 }} disabled={sending}>
            Envoyer le code
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} noValidate aria-busy={sending}>
          <div>
            <label htmlFor="email-code">Code à six chiffres</label>
            <input
              id="email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
            />
          </div>
          <button type="submit" className="y-btn y-btn-md y-btn-primary y-btn-pill" style={{ minHeight: 44, marginTop: 16 }} disabled={sending}>
            Confirmer
          </button>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" style={{ minHeight: 44 }} onClick={resend}>
              Renvoyer le code
            </button>{' '}
            <button type="button" onClick={() => setStep('address')} style={{ minHeight: 44 }}>
              Changer d’adresse
            </button>
          </div>
        </form>
      )}

      {message !== null ? (
        <p role={isError ? 'alert' : 'status'} tabIndex={-1}>
          {message}
        </p>
      ) : null}
    </>
  );
}
