'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { YMark } from '@/components/brand/y-mark';
import { Button } from '@/components/auth/button';
import { TextField } from '@/components/auth/text-field';
import styles from '@/components/admin/admin.module.css';
import { confirmMfaSetup, startMfaSetup, type MfaSetup } from '@/lib/admin-api';

const MISSING_LINK_MESSAGE = 'Ce lien est incomplet. Ouvrez le lien reçu par e-mail.';
const GENERIC_ERROR_MESSAGE = 'Une erreur est survenue. Réessayez.';

/**
 * Back-office second-factor set-up. The token of the e-mail link starts it: the secret is shown once, then the first code
 * from the authenticator application confirms it, and the backup codes are shown once. The session is signed in only
 * after that confirmation.
 */
export function MfaSetupForm() {
  const token = useSearchParams().get('token') ?? '';
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // The effect can run twice in development: the set-up must start once, or the shown secret would not be the stored one.
    if (started.current) {
      return;
    }
    started.current = true;

    if (token === '') {
      return;
    }

    void startMfaSetup(token).then((result) => {
      if (result.ok) {
        setSetup(result.body);
      } else {
        setMessage(result.problem.detail || GENERIC_ERROR_MESSAGE);
      }
    });
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    const result = await confirmMfaSetup(code.trim());
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.problem.detail || GENERIC_ERROR_MESSAGE);
      return;
    }

    setBackupCodes(result.body.backupCodes);
  }

  return (
    <main className={styles.login}>
      <div aria-hidden="true">
        <YMark size={320} />
      </div>
      <div className={styles.loginColumn}>
        <p className={styles.loginKicker}>Administration</p>
        <h1 className={styles.loginTitle}>Double authentification</h1>

        {token === '' || message ? (
          <p role="alert" className={styles.alert}>
            {token === '' ? MISSING_LINK_MESSAGE : message}
          </p>
        ) : null}

        {backupCodes ? (
          <>
            <p>Notez ces codes de secours maintenant. Ils ne seront plus affichés, et chacun ne sert qu’une fois.</p>
            <ul>
              {backupCodes.map((backupCode) => (
                <li key={backupCode}>
                  <code>{backupCode}</code>
                </li>
              ))}
            </ul>
            <Link href="/admin">Accéder au back-office</Link>
          </>
        ) : setup ? (
          <>
            <p>
              Saisissez ce secret dans votre application d’authentification, puis entrez le code à 6 chiffres qu’elle
              affiche.
            </p>
            <p>
              <code>{setup.secret}</code>
            </p>
            <a href={setup.otpauthUri}>Ouvrir dans l’application</a>
            <form className={styles.loginForm} noValidate onSubmit={handleSubmit}>
              <fieldset disabled={submitting}>
                <TextField
                  id="admin-mfa-code"
                  name="code"
                  label="Code de vérification à 6 chiffres"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
                <Button type="submit">{submitting ? 'Confirmation…' : 'Confirmer'}</Button>
              </fieldset>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
