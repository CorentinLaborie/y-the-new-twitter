'use client';

import { TOUCH_LINK } from './touch-link';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { tooManyAttemptsMessage } from '@/components/auth/messages';
import { PASSWORD_RULE_HINT, passwordProblem } from '@/app/forgot-password/password-rule';
import { changePassword } from '@/lib/settings-api';
import type { ApiProblem } from '@/lib/api-client';

/** The text of the server refusal of a password that does not meet the policy (backend/src/auth/password.ts). */
const PASSWORD_REFUSED =
  'Le mot de passe doit contenir de 8 à 128 caractères, dont au moins un chiffre et un caractère spécial.';
const CURRENT_REQUIRED = 'Saisissez votre mot de passe actuel.';
const CONFIRMATION_MISMATCH = 'Les deux mots de passe ne correspondent pas.';
const SUCCESS_MESSAGE = 'Votre mot de passe a été modifié.';

type FieldErrors = { current?: string; next?: string; confirmation?: string };

/** Where a server refusal is shown: the policy under the new password, the other 422 under the current one. */
function fieldErrorOf(problem: ApiProblem): FieldErrors {
  if (problem.status === 422) {
    return problem.detail === PASSWORD_REFUSED
      ? { next: problem.detail }
      : { current: problem.detail };
  }
  return {};
}

/*
 * The password form of the settings (plan L5, section 6.2, decisions 11, 12 and 16). Three fields, the confirmation is
 * checked in the browser before any call. The button shows its pending state. On success the fields are cleared and
 * the success message takes the focus.
 */
export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);

  function checkBeforeSending(): FieldErrors {
    const found: FieldErrors = {};
    if (current === '') {
      found.current = CURRENT_REQUIRED;
    }
    const policy = passwordProblem(next);
    if (policy !== null) {
      found.next = policy;
    }
    if (next !== confirmation) {
      found.confirmation = CONFIRMATION_MISMATCH;
    }
    return found;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    const found = checkBeforeSending();
    setErrors(found);
    setFormMessage(null);
    if (Object.keys(found).length > 0) {
      // A confirmation that does not match is refused here, without any call (plan L5, 6.2).
      return;
    }

    setSending(true);
    const result = await changePassword(current, next);
    setSending(false);
    if (result.ok) {
      setCurrent('');
      setNext('');
      setConfirmation('');
      setErrors({});
      setFormMessage(SUCCESS_MESSAGE);
      successRef.current?.focus();
      return;
    }

    if (result.problem.status === 429) {
      setFormMessage(tooManyAttemptsMessage(result.problem));
      return;
    }
    const fieldErrors = fieldErrorOf(result.problem);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setFormMessage(result.problem.detail);
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={sending}>
      <div>
        <label htmlFor="settings-current-password">Mot de passe actuel</label>
        <input
          id="settings-current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          aria-invalid={errors.current ? true : undefined}
          aria-describedby={errors.current ? 'settings-current-error' : undefined}
          style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
        />
        {errors.current ? (
          <p id="settings-current-error" role="alert">
            {errors.current}
          </p>
        ) : null}
        <Link href="/forgot-password" style={TOUCH_LINK}>Mot de passe oublié ?</Link>
      </div>

      <div>
        <label htmlFor="settings-new-password">Nouveau mot de passe</label>
        <p id="settings-new-hint">{PASSWORD_RULE_HINT}</p>
        <input
          id="settings-new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={errors.next ? 'settings-new-hint settings-new-error' : 'settings-new-hint'}
          style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
        />
        {errors.next ? (
          <p id="settings-new-error" role="alert">
            {errors.next}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="settings-confirm-password">Confirmer le nouveau mot de passe</label>
        <input
          id="settings-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={errors.confirmation ? true : undefined}
          aria-describedby={errors.confirmation ? 'settings-confirm-error' : undefined}
          style={{ display: 'block', width: '100%', minHeight: 44, fontSize: 16 }}
        />
        {errors.confirmation ? (
          <p id="settings-confirm-error" role="alert">
            {errors.confirmation}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="y-btn y-btn-md y-btn-primary y-btn-pill"
        style={{ minHeight: 44, marginTop: 16 }}
        disabled={sending}
      >
        Enregistrer
      </button>

      {formMessage !== null && formMessage !== SUCCESS_MESSAGE ? <p role="alert">{formMessage}</p> : null}
      {formMessage === SUCCESS_MESSAGE ? (
        <p ref={successRef} role="status" tabIndex={-1}>
          {SUCCESS_MESSAGE}
        </p>
      ) : null}
    </form>
  );
}
