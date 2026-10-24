'use client';

import { useEffect, useState } from 'react';
import {
  getNotificationPreferences,
  setNotificationPreference,
  type NotificationPreferenceType,
} from '@/lib/settings-api';

type Row = {
  id: string;
  label: string;
  description: string;
  types: NotificationPreferenceType[];
};

/** The five rows of the page, as the mockup gives them. The reactions row switches its three kinds together. */
const ROWS: Row[] = [
  {
    id: 'replies',
    label: 'Réponses à mes questions',
    description: 'Quand quelqu’un répond à une question que vous avez posée.',
    types: ['reply_to_question'],
  },
  {
    id: 'opened',
    label: 'Mon Y a atteint 50',
    description: 'Quand une de vos questions atteint 50 Y et ouvre une conversation.',
    types: ['conversation_opened'],
  },
  {
    id: 'reactions',
    label: 'Réactions (J’aime, Pas d’accord, Y)',
    description: 'Quand une de vos questions reçoit une réaction.',
    types: ['reaction_like', 'reaction_dislike', 'reaction_y'],
  },
  {
    id: 'follows',
    label: 'Nouveaux abonnés',
    description: 'Quand un compte commence à vous suivre.',
    types: ['follow'],
  },
  {
    id: 'mentions',
    label: 'Mentions',
    description: 'Quand quelqu’un vous mentionne dans une question ou une réponse.',
    types: ['mention'],
  },
];

const LOADING_MESSAGE = 'Chargement des paramètres';
const LOAD_FAILED_MESSAGE = 'Vos préférences n’ont pas pu être chargées.';
const SAVED_MESSAGE = 'Préférence enregistrée.';
const SAVE_FAILED_MESSAGE = 'La préférence n’a pas pu être enregistrée. Réessayez.';

type Values = Partial<Record<NotificationPreferenceType, boolean>>;

/** A type without a stored row is on: the default of the model. */
function valueOf(values: Values, type: NotificationPreferenceType): boolean {
  return values[type] ?? true;
}

/*
 * The notification settings (plan L5, section 6.4). A switch per row, changed at once, with no save button. While a
 * change is sent, its switch is disabled. A failure leaves the switch on its previous value and shows an alert; a
 * success is announced. The reactions row sends one change for each of its three kinds.
 */
export function NotificationSettings() {
  const [values, setValues] = useState<Values>({});
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    getNotificationPreferences().then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        const next: Values = {};
        for (const item of result.body.items) {
          next[item.type] = item.enabled;
        }
        setValues(next);
        setLoaded(true);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function toggle(row: Row) {
    if (pending !== null) {
      return;
    }
    const next = !row.types.every((type) => valueOf(values, type));
    setPending(row.id);
    setNotice(null);
    const results = await Promise.all(row.types.map((type) => setNotificationPreference(type, next)));
    setPending(null);

    if (results.every((result) => result.ok)) {
      setValues((current) => {
        const updated = { ...current };
        for (const type of row.types) {
          updated[type] = next;
        }
        return updated;
      });
      setNotice(SAVED_MESSAGE);
      setIsError(false);
      return;
    }
    setNotice(SAVE_FAILED_MESSAGE);
    setIsError(true);
  }

  return (
    <section aria-labelledby="notifications-settings-title">
      <h1 id="notifications-settings-title">Mes notifications</h1>

      {!loaded && !loadFailed ? <p role="status">{LOADING_MESSAGE}</p> : null}
      {loadFailed ? (
        <div>
          <p role="alert">{LOAD_FAILED_MESSAGE}</p>
          <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" onClick={() => setReloadKey((key) => key + 1)}>
            Réessayer
          </button>
        </div>
      ) : null}

      {loaded ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ROWS.map((row) => {
            const on = row.types.every((type) => valueOf(values, type));
            const busy = pending === row.id;
            return (
              <li key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '12px 0' }}>
                <span id={`${row.id}-label`} style={{ flex: 1, minWidth: 0 }}>
                  <strong>{row.label}</strong>
                  <br />
                  <span>{row.description}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`${row.id}-label`}
                  aria-busy={busy}
                  disabled={busy}
                  onClick={() => toggle(row)}
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  {on ? 'Activé' : 'Désactivé'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {notice !== null ? (
        <p role={isError ? 'alert' : 'status'} tabIndex={-1}>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
