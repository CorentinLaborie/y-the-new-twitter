'use client';

import { TOUCH_LINK } from './touch-link';
import { DESTRUCTIVE } from './destructive-style';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LEGAL_LINKS } from '@/components/navigation/nav-items';
import { logout } from '@/lib/auth-api';
import { type AccountSettings, getAccount } from '@/lib/settings-api';

const LOADING_MESSAGE = 'Chargement des paramètres';
const LOAD_FAILED_MESSAGE = 'Vos paramètres n’ont pas pu être chargés.';

/*
 * The settings hub (plan L5, section 6.1): the account, the sections, the legal pages, the deletion and the sign-out.
 * The sign-out stays possible when the account cannot be read. The sign-out is confirmed by the server before the
 * visitor goes to the login page: a failed call keeps the page and shows its message.
 */
export function SettingsHub() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAccount().then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setAccount(result.body);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function signOut() {
    const result = await logout();
    if (!result.ok) {
      setSignOutMessage(result.problem.detail);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">Paramètres</h1>

      {account === null && !loadFailed ? <p role="status">{LOADING_MESSAGE}</p> : null}
      {loadFailed ? (
        <div>
          <p role="alert">{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" onClick={() => setReloadKey((key) => key + 1)}>
            Réessayer
          </button>
        </div>
      ) : null}

      {account !== null ? (
        <section aria-labelledby="account-title">
          <h2 id="account-title">Compte</h2>
          <p>
            <span>Adresse e-mail</span> <strong>{account.email}</strong>
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li>
              <Link href="/settings/email" style={TOUCH_LINK}>Changer d’adresse e-mail</Link>
            </li>
            <li>
              <Link href="/settings/password" style={TOUCH_LINK}>Changer de mot de passe</Link>
            </li>
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="notifications-title">
        <h2 id="notifications-title">Notifications</h2>
        <Link href="/settings/notifications" style={TOUCH_LINK}>Gérer mes notifications</Link>
      </section>

      <section aria-labelledby="about-title">
        <h2 id="about-title">Aide et à propos</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} style={TOUCH_LINK}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="session-title">
        <h2 id="session-title" className="y-sr">
          Session et suppression
        </h2>
        <Link href="/settings/delete-account" className="y-btn y-btn-md y-btn-danger y-btn-pill" style={{ ...DESTRUCTIVE, minHeight: 44 }}>
          Supprimer mon compte
        </Link>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" style={{ minHeight: 44 }} onClick={signOut}>
            Se déconnecter
          </button>
          {signOutMessage ? <p role="alert">{signOutMessage}</p> : null}
        </div>
      </section>
    </section>
  );
}
